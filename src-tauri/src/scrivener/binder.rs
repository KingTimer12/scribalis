//! The binder tree of a `.scrivx` project file.
use quick_xml::{events::{BytesStart, Event}, Reader};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq)]
pub enum ItemKind {
    Draft,
    Research,
    Trash,
    Folder,
    Text,
    Image,
    File,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BinderItem {
    /// `UUID` (Scrivener 3) or `ID` (Scrivener 2).
    pub key: String,
    pub kind: ItemKind,
    pub title: String,
    pub children: Vec<BinderItem>,
}

fn invalid() -> AppError {
    AppError::msg("Projeto do Scrivener inválido")
}

fn kind_of(t: &str) -> ItemKind {
    match t {
        "DraftFolder" => ItemKind::Draft,
        "ResearchFolder" => ItemKind::Research,
        "TrashFolder" => ItemKind::Trash,
        "Folder" => ItemKind::Folder,
        "Text" => ItemKind::Text,
        "Image" => ItemKind::Image,
        _ => ItemKind::File,
    }
}

fn item_from(e: &BytesStart) -> BinderItem {
    let mut item = BinderItem { key: String::new(), kind: ItemKind::File, title: String::new(), children: Vec::new() };
    for a in e.attributes().flatten() {
        let value = a.unescape_value().map(|v| v.into_owned()).unwrap_or_default();
        match a.key.local_name().as_ref() {
            b"UUID" | b"ID" => item.key = value,
            b"Type" => item.kind = kind_of(&value),
            _ => {}
        }
    }
    item
}

/// True when the element path is inside `<Binder>` (collections list items too).
fn in_binder(path: &[Vec<u8>]) -> bool {
    path.iter().any(|n| n.as_slice() == b"Binder")
}

fn attach(stack: &mut [BinderItem], roots: &mut Vec<BinderItem>, item: BinderItem) {
    match stack.last_mut() {
        Some(parent) => parent.children.push(item),
        None => roots.push(item),
    }
}

pub fn parse_binder(xml: &str) -> AppResult<Vec<BinderItem>> {
    let mut reader = Reader::from_str(xml);
    let mut roots = Vec::new();
    let mut stack: Vec<BinderItem> = Vec::new();
    let mut path: Vec<Vec<u8>> = Vec::new();
    let mut saw_binder = false;
    loop {
        match reader.read_event().map_err(|_| invalid())? {
            Event::Start(e) => {
                let name = e.local_name().as_ref().to_vec();
                if name == b"Binder" {
                    saw_binder = true;
                }
                if name == b"BinderItem" && in_binder(&path) {
                    stack.push(item_from(&e));
                }
                path.push(name);
            }
            Event::Empty(e) => {
                if e.local_name().as_ref() == b"BinderItem" && in_binder(&path) {
                    attach(&mut stack, &mut roots, item_from(&e));
                }
            }
            Event::Text(t) => {
                let n = path.len();
                if n >= 2 && path[n - 1] == b"Title" && path[n - 2] == b"BinderItem" && in_binder(&path[..n - 1]) {
                    if let Some(item) = stack.last_mut() {
                        item.title.push_str(&t.unescape().map_err(|_| invalid())?);
                    }
                }
            }
            Event::End(e) => {
                path.pop();
                if e.local_name().as_ref() == b"BinderItem" && in_binder(&path) {
                    if let Some(item) = stack.pop() {
                        attach(&mut stack, &mut roots, item);
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !saw_binder || !stack.is_empty() || !path.is_empty() {
        return Err(invalid());
    }
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::*;

    const V3: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="X" Version="2.0">
  <Binder>
    <BinderItem UUID="D-1" Type="DraftFolder" Created="x">
      <Title>Manuscrito</Title>
      <MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData>
      <Children>
        <BinderItem UUID="C-1" Type="Folder"><Title>Cap&#237;tulo 1</Title>
          <Children><BinderItem UUID="S-1" Type="Text"><Title>Cena &amp; fuga</Title></BinderItem></Children>
        </BinderItem>
        <BinderItem UUID="S-2" Type="Text"/>
      </Children>
    </BinderItem>
    <BinderItem UUID="R-1" Type="ResearchFolder"><Title>Pesquisa</Title>
      <Children><BinderItem UUID="I-1" Type="Image"><Title>Mapa</Title></BinderItem>
      <BinderItem UUID="P-1" Type="PDF"><Title>Artigo</Title></BinderItem></Children>
    </BinderItem>
    <BinderItem UUID="T-1" Type="TrashFolder"><Title>Lixeira</Title></BinderItem>
  </Binder>
  <Collections><Collection><Title>Busca</Title></Collection></Collections>
</ScrivenerProject>"#;

    #[test]
    fn reads_the_scrivener3_binder() {
        let items = parse_binder(V3).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!((items[0].kind.clone(), items[0].title.as_str(), items[0].key.as_str()), (ItemKind::Draft, "Manuscrito", "D-1"));
        let ch = &items[0].children[0];
        assert_eq!((ch.kind.clone(), ch.title.as_str()), (ItemKind::Folder, "Capítulo 1"));
        assert_eq!(ch.children[0].title, "Cena & fuga");
        assert_eq!((items[0].children[1].kind.clone(), items[0].children[1].title.as_str()), (ItemKind::Text, ""));
        assert_eq!(items[1].children[0].kind, ItemKind::Image);
        assert_eq!(items[1].children[1].kind, ItemKind::File);
        assert_eq!(items[2].kind, ItemKind::Trash);
    }

    #[test]
    fn reads_the_scrivener2_ids() {
        let xml = r#"<ScrivenerProject><Binder><BinderItem ID="0" Type="DraftFolder"><Title>Draft</Title>
            <Children><BinderItem ID="7" Type="Text"><Title>Um</Title></BinderItem></Children></BinderItem></Binder></ScrivenerProject>"#;
        let items = parse_binder(xml).unwrap();
        assert_eq!(items[0].children[0].key, "7");
    }

    #[test]
    fn broken_xml_is_an_invalid_project() {
        assert_eq!(parse_binder("<ScrivenerProject><Binder><BinderItem").unwrap_err().0, "Projeto do Scrivener inválido");
        assert_eq!(parse_binder("<nada/>").unwrap_err().0, "Projeto do Scrivener inválido");
    }
}
