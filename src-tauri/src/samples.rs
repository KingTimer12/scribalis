use crate::model::metadata::Status;

pub struct SampleChapter {
    pub title: &'static str,
    pub status: Status,
    /// Chapter markdown.
    pub body: &'static str,
    pub notes: &'static str,
}

pub struct SampleBook {
    pub title: &'static str,
    pub cur: usize,
    /// How long ago it was edited, in hours.
    pub age_hours: u64,
    pub chapters: Vec<SampleChapter>,
}

pub fn sample_books() -> Vec<SampleBook> {
    vec![
        SampleBook {
            title: "A Torre das Mil Luas",
            cur: 2,
            age_hours: 2,
            chapters: vec![
                SampleChapter {
                    title: "O sino que não tocava",
                    status: Status::Pronto,
                    body: "Na cidade de Vael, todo mundo sabia que o sino da torre norte não tocava havia cem anos.\n\nPor isso, quando ele soou à meia-noite — uma única vez, grave e longa —, Ilen Marr foi a única pessoa da rua que não saiu de casa para olhar. Ela já estava de pé, com a lanterna acesa e a bolsa de ferramentas no ombro, como se tivesse esperado por aquele som a vida inteira.\n\n— Então é hoje — murmurou, e apagou a vela da mesa.\n",
                    notes: "Revelar quem tocou o sino só no capítulo 5.\n\nIlen já sabia do sino — plantar a pista da bolsa de ferramentas.",
                },
                SampleChapter {
                    title: "A aprendiz de cartógrafo",
                    status: Status::Revisao,
                    body: "O mapa de Ilen tinha um erro, e o erro estava se mexendo.\n\nDurante três semanas ela tinha marcado com tinta vermelha a mesma viela atrás do mercado de sal. Toda manhã, a viela estava dois passos mais perto da torre.\n\n***\n\nMestre Odran dizia que mapas não mentem. Ilen começava a desconfiar que mapas apenas escolhem a quem contar a verdade.\n",
                    notes: "",
                },
                SampleChapter {
                    title: "Mapas que mentem",
                    status: Status::Rascunho,
                    body: "A torre norte não tinha porta. Tinha, no lugar dela, uma parede lisa onde alguém havia desenhado a giz o contorno de uma.\n",
                    notes: "Odran aparece no fim? Decidir.",
                },
            ],
        },
        SampleBook {
            title: "Herdeira das Cinzas",
            cur: 1,
            age_hours: 27,
            chapters: vec![
                SampleChapter {
                    title: "A coroação que não houve",
                    status: Status::Revisao,
                    body: "A coroa chegou ao salão numa caixa de madeira comum, carregada por um menino de recados que não sabia o que levava.\n\nQuando Saera abriu a tampa, encontrou apenas cinza — fina, morna, ainda cheirando a fumaça.\n",
                    notes: "",
                },
                SampleChapter {
                    title: "Sal e ferro",
                    status: Status::Rascunho,
                    body: "O conselho levou três dias para decidir que a culpa era dela.\n",
                    notes: "",
                },
            ],
        },
        SampleBook {
            title: "Crônicas do Quinto Andar",
            cur: 0,
            age_hours: 144,
            chapters: vec![SampleChapter {
                title: "O vizinho do 502",
                status: Status::Rascunho,
                body: "O vizinho do 502 recebia cartas endereçadas a pessoas que ainda não tinham nascido.\n",
                notes: "",
            }],
        },
    ]
}
