use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Layer {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub locked: bool,
}

fn default_true() -> bool {
    true
}

impl Layer {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            visible: true,
            locked: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip() {
        let layer = Layer {
            id: "layer-2".into(),
            name: "Terrain".into(),
            visible: false,
            locked: true,
        };
        let s = serde_json::to_string(&layer).unwrap();
        let back: Layer = serde_json::from_str(&s).unwrap();
        assert_eq!(layer, back);
    }

    #[test]
    fn defaults_when_missing_flags() {
        let json = r#"{"id":"layer-1","name":"X"}"#;
        let l: Layer = serde_json::from_str(json).unwrap();
        assert!(l.visible);
        assert!(!l.locked);
    }
}
