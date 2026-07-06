//! Bevy resources wrapping the core world model and shared editor state.
use bevy::ecs::message::Message;
use bevy::prelude::Resource;
use glyphweave_core::edit::Edit;
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

/// Buffered edit request produced by the tool system, consumed by render-sync.
/// Always applied to the world's `active_layer` in P1.
#[derive(Message, Clone, Copy, Debug)]
pub struct EditEvent {
    pub x: i32,
    pub y: i32,
    pub edit: Edit,
}

/// Last-known tile coordinate under the OS cursor (for UI read-out).
#[derive(Resource, Default, Debug, Clone, Copy)]
pub struct CursorTile {
    pub x: i32,
    pub y: i32,
    pub valid: bool,
}
