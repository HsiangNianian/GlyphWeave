use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unknown tile id: {0}")]
    UnknownTileId(String),
    #[error("invalid coordinate key '{0}' (expected \"x,y\" with i32 parts)")]
    InvalidCoordKey(String),
    #[error("unsupported gemap version: {0}")]
    UnsupportedVersion(u32),
    /// Reserved for a future layer-mutation API; not constructed in P1.
    #[allow(dead_code)]
    #[error("layer '{0}' not found")]
    UnknownLayer(String),
}

pub type Result<T> = std::result::Result<T, CoreError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_formats() {
        let e = CoreError::UnknownTileId("xyz".into());
        assert_eq!(e.to_string(), "unknown tile id: xyz");
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "missing");
        let from_io: CoreError = io_err.into();
        assert!(matches!(from_io, CoreError::Io(_)));
    }
}
