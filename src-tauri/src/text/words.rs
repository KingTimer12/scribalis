/// Counts whitespace-separated words.
pub fn count_words(s: &str) -> usize {
    s.split_whitespace().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_words_across_whitespace_kinds() {
        assert_eq!(count_words("  um\tdois\n\ntrês  "), 3);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("— Então é hoje — murmurou"), 6);
    }
}
