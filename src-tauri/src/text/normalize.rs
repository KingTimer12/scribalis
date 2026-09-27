use unicode_normalization::UnicodeNormalization;

/// Lowercases and strips diacritics, for accent-insensitive search.
pub fn fold(s: &str) -> String {
    s.nfd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_accents_and_case() {
        assert_eq!(fold("Coração ÁGUA"), "coracao agua");
    }
}
