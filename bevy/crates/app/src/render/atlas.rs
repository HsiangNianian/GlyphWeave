//! Atlas loading. atlas.png is 26 cells x 24px, sliced by bevy_ecs_tilemap.
use bevy::asset::AssetServer;
use bevy::image::Image;
use bevy::prelude::*;
use glyphweave_core::tile::TileKind;

pub fn tile_index(kind: TileKind) -> u32 {
    kind.index() as u32
}

/// Strong handle to the atlas image, kept on a resource so it never unloads.
#[derive(Resource)]
pub struct TileAtlas {
    pub image: Handle<Image>,
}

pub fn load_atlas(mut commands: Commands, asset_server: Res<AssetServer>) {
    let image: Handle<Image> = asset_server.load("textures/atlas.png");
    commands.insert_resource(TileAtlas { image });
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
