//! Bevy resources wrapping the core world model and shared editor state.
use bevy::ecs::message::Message;
use bevy::prelude::Resource;
use glyphweave_core::world::World;

/// Newtype around `core::World` to avoid a name clash with `bevy::prelude::World`.
#[derive(Resource)]
pub struct WorldModel(pub World);

impl std::ops::Deref for WorldModel {
    type Target = World;
    fn deref(&self) -> &World {
        &self.0
    }
}
impl std::ops::DerefMut for WorldModel {
    fn deref_mut(&mut self) -> &mut World {
        &mut self.0
    }
}

/// Monotonic world-content revision used by cached UI projections.
#[derive(Resource, Debug, Clone, Copy, Default)]
pub struct WorldRevision(pub u64);

/// Tile coordinate changed in the core world and should be mirrored to render state.
#[derive(Message, Clone, Copy, Debug)]
pub struct EditEvent {
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
    pub view_distance: u32,
    pub show_grid: bool,
    pub show_minimap: bool,
}

impl Default for EditorViewSettings {
    fn default() -> Self {
        Self {
            view_distance: 5,
            show_grid: true,
            show_minimap: true,
        }
    }
}

/// Full-world snapshots for undo/redo. This is intentionally coarse for now:
/// the Bevy port still uses bounded tilemaps, so whole-world restore plus a
/// render refresh is simpler and safer than trying to replay structural edits.
#[derive(Resource, Debug, Default)]
pub struct EditorHistory {
    undo_stack: Vec<World>,
    redo_stack: Vec<World>,
}

impl EditorHistory {
    const MAX_HISTORY: usize = 50;

    pub fn push_snapshot(&mut self, world: &World) {
        self.undo_stack.push(world.clone());
        if self.undo_stack.len() > Self::MAX_HISTORY {
            self.undo_stack.remove(0);
        }
        self.redo_stack.clear();
    }

    pub fn undo(&mut self, world: &mut World) -> bool {
        let Some(previous) = self.undo_stack.pop() else {
            return false;
        };
        self.redo_stack.push(world.clone());
        *world = previous;
        true
    }

    pub fn redo(&mut self, world: &mut World) -> bool {
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
