//! Bevy resources wrapping the core world model and shared editor state.
use bevy::ecs::message::Message;
use bevy::prelude::Resource;
use glyphweave_core::voxel::VoxelWorld;

/// Authoritative editable voxel world plus editor-only display scale.
#[derive(Resource)]
pub struct WorldModel {
    pub world: VoxelWorld,
    pub tile_size: u32,
}

impl WorldModel {
    pub const fn new(world: VoxelWorld, tile_size: u32) -> Self {
        Self { world, tile_size }
    }
}

impl std::ops::Deref for WorldModel {
    type Target = VoxelWorld;
    fn deref(&self) -> &VoxelWorld {
        &self.world
    }
}
impl std::ops::DerefMut for WorldModel {
    fn deref_mut(&mut self) -> &mut VoxelWorld {
        &mut self.world
    }
}

/// The z slice currently shown and edited. This is editor state, not `.gemap` data.
#[derive(Resource, Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ActiveZ(pub i32);

/// Monotonic world-content revision used by cached UI projections.
#[derive(Resource, Debug, Clone, Copy, Default)]
pub struct WorldRevision(pub u64);

/// Tile coordinate changed in the core world and should be mirrored to render state.
#[derive(Message, Clone, Copy, Debug)]
pub struct EditEvent {
    pub z: i32,
    pub x: i32,
    pub y: i32,
}

/// Last-known tile coordinate under the OS cursor (for UI read-out).
#[derive(Resource, Default, Debug, Clone, Copy)]
pub struct CursorTile {
    pub x: i32,
    pub y: i32,
    pub valid: bool,
}

/// Currently active theme id ("ansi-16" or "cogmind"). Drives atlas texture choice.
#[derive(Resource, Debug, Clone, Default)]
pub struct ActiveTheme(pub String);

/// Editor tool mode, matching the Vite toolbar.
#[derive(Resource, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EditorTool {
    #[default]
    Brush,
    Erase,
    Fill,
    Pan,
    Select,
}

/// Current preset selection by `crate::preset::PRESETS` index.
#[derive(Resource, Debug, Clone, Copy, Default)]
pub struct ActivePreset(pub Option<usize>);

/// View toggles shown in the Settings tab.
#[derive(Resource, Debug, Clone, Copy)]
pub struct EditorViewSettings {
    pub render_distance_chunks: u32,
    pub show_grid: bool,
    pub show_minimap: bool,
    pub show_fog_of_war: bool,
    pub fog_radius: u32,
    pub fog_softness: u32,
}

pub const DEFAULT_RENDER_DISTANCE_CHUNKS: u32 = 4;
pub const MIN_RENDER_DISTANCE_CHUNKS: u32 = 1;
pub const MAX_RENDER_DISTANCE_CHUNKS: u32 = 12;

impl EditorViewSettings {
    pub fn clamped_render_distance_chunks(&self) -> u32 {
        self.render_distance_chunks
            .clamp(MIN_RENDER_DISTANCE_CHUNKS, MAX_RENDER_DISTANCE_CHUNKS)
    }
}

impl Default for EditorViewSettings {
    fn default() -> Self {
        Self {
            render_distance_chunks: DEFAULT_RENDER_DISTANCE_CHUNKS,
            show_grid: true,
            show_minimap: true,
            show_fog_of_war: false,
            fog_radius: 8,
            fog_softness: 3,
        }
    }
}

/// Full-voxel-world snapshots for undo/redo. This remains intentionally coarse
/// while the editor transition prioritizes a correct z-slice storage loop.
#[derive(Resource, Debug, Default)]
pub struct EditorHistory {
    undo_stack: Vec<VoxelWorld>,
    redo_stack: Vec<VoxelWorld>,
}

impl EditorHistory {
    const MAX_HISTORY: usize = 50;

    pub fn push_snapshot(&mut self, world: &VoxelWorld) {
        self.undo_stack.push(world.clone());
        if self.undo_stack.len() > Self::MAX_HISTORY {
            self.undo_stack.remove(0);
        }
        self.redo_stack.clear();
    }

    pub fn undo(&mut self, world: &mut VoxelWorld) -> bool {
        let Some(previous) = self.undo_stack.pop() else {
            return false;
        };
        self.redo_stack.push(world.clone());
        *world = previous;
        true
    }

    pub fn redo(&mut self, world: &mut VoxelWorld) -> bool {
        let Some(next) = self.redo_stack.pop() else {
            return false;
        };
        self.undo_stack.push(world.clone());
        *world = next;
        true
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glyphweave_core::voxel::VoxelCoord;

    #[test]
    fn history_restores_edits_across_z_slices() {
        let mut world = VoxelWorld::new("history");
        let wall = world.intern_block("glyphweave:wall").unwrap();
        let base = VoxelCoord::new(0, 2, 3);
        let upper = VoxelCoord::new(4, 2, 3);
        world.set(base, wall).unwrap();

        let mut history = EditorHistory::default();
        history.push_snapshot(&world);
        world.set(upper, wall).unwrap();

        assert!(history.undo(&mut world));
        assert_eq!(world.get(base), wall);
        assert!(world.get(upper).is_air());
        assert!(history.redo(&mut world));
        assert_eq!(world.get(upper), wall);
    }
}
