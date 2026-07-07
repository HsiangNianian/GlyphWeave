//! Atlas loading. Themed atlases, each 26 cells x 24px.
//! Both share TileKind glyph order, so the app swaps textures at runtime for
//! instant theme switching.
use bevy::asset::AssetServer;
use bevy::image::Image;
use bevy::prelude::*;
use glyphweave_core::tile::TileKind;

pub fn tile_index(kind: TileKind) -> u32 {
    kind.index() as u32
}

/// Strong handles to both themed atlases, kept on a resource so they never unload.
#[derive(Resource)]
pub struct TileAtlas {
    pub ansi16: Handle<Image>,
    pub cogmind: Handle<Image>,
    pub fortress_pixel: Handle<Image>,
}

impl TileAtlas {
    /// Pick the atlas handle for a theme id. Unknown -> ansi-16.
    pub fn handle_for(&self, theme_id: &str) -> Handle<Image> {
        match theme_id {
            "cogmind" => self.cogmind.clone(),
            "fortress-pixel" => self.fortress_pixel.clone(),
            _ => self.ansi16.clone(),
        }
    }
}

pub fn load_atlas(mut commands: Commands, asset_server: Res<AssetServer>) {
    let ansi16: Handle<Image> = asset_server.load("textures/atlas-ansi-16.png");
    let cogmind: Handle<Image> = asset_server.load("textures/atlas-cogmind.png");
    let fortress_pixel: Handle<Image> = asset_server.load("textures/atlas-fortress-pixel.png");
    commands.insert_resource(TileAtlas {
        ansi16,
        cogmind,
        fortress_pixel,
    });
}

#[cfg(test)]
mod tests {
    use super::tile_index;
    use glyphweave_core::tile::TileKind;

    #[test]
    fn tile_index_matches_atlas_order() {
        assert_eq!(tile_index(TileKind::Void), 0);
        assert_eq!(tile_index(TileKind::Wall), 1);
        assert_eq!(tile_index(TileKind::Bar), 25);
    }
}
