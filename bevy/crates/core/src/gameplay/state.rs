use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

pub type EntityId = u64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TileCoord {
    pub x: i32,
    pub y: i32,
}

impl TileCoord {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    pub fn manhattan(self, other: TileCoord) -> u32 {
        self.x.abs_diff(other.x) + self.y.abs_diff(other.y)
    }

    pub fn neighbors4(self) -> [TileCoord; 4] {
        [
            TileCoord::new(self.x - 1, self.y),
            TileCoord::new(self.x + 1, self.y),
            TileCoord::new(self.x, self.y - 1),
            TileCoord::new(self.x, self.y + 1),
        ]
    }
}

impl From<(i32, i32)> for TileCoord {
    fn from(value: (i32, i32)) -> Self {
        Self::new(value.0, value.1)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TileArea {
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
}

impl TileArea {
    pub fn rect(a: TileCoord, b: TileCoord) -> Self {
        Self {
            min_x: a.x.min(b.x),
            min_y: a.y.min(b.y),
            max_x: a.x.max(b.x),
            max_y: a.y.max(b.y),
        }
    }

    pub fn single(coord: TileCoord) -> Self {
        Self::rect(coord, coord)
    }

    pub fn centered(center: TileCoord, radius: i32) -> Self {
        let radius = radius.max(0);
        Self {
            min_x: center.x - radius,
            min_y: center.y - radius,
            max_x: center.x + radius,
            max_y: center.y + radius,
        }
    }

    pub fn contains(self, coord: TileCoord) -> bool {
        coord.x >= self.min_x
            && coord.x <= self.max_x
            && coord.y >= self.min_y
            && coord.y <= self.max_y
    }

    pub fn center(self) -> TileCoord {
        TileCoord::new((self.min_x + self.max_x) / 2, (self.min_y + self.max_y) / 2)
    }

    pub fn len(self) -> usize {
        let width = (self.max_x - self.min_x + 1).max(0) as usize;
        let height = (self.max_y - self.min_y + 1).max(0) as usize;
        width.saturating_mul(height)
    }

    pub fn is_empty(self) -> bool {
        self.len() == 0
    }

    pub fn iter(self) -> TileAreaIter {
        TileAreaIter {
            area: self,
            next: Some(TileCoord::new(self.min_x, self.min_y)),
        }
    }
}

pub struct TileAreaIter {
    area: TileArea,
    next: Option<TileCoord>,
}

impl Iterator for TileAreaIter {
    type Item = TileCoord;

    fn next(&mut self) -> Option<Self::Item> {
        let current = self.next?;
        self.next = if current.x < self.area.max_x {
            Some(TileCoord::new(current.x + 1, current.y))
        } else if current.y < self.area.max_y {
            Some(TileCoord::new(self.area.min_x, current.y + 1))
        } else {
            None
        };
        Some(current)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ResourceKind {
    Wood,
    Stone,
    Food,
    Ore,
}

impl ResourceKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Wood => "wood",
            Self::Stone => "stone",
            Self::Food => "food",
            Self::Ore => "ore",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Inventory {
    counts: HashMap<ResourceKind, u32>,
}

impl Inventory {
    pub fn add(&mut self, kind: ResourceKind, amount: u32) {
        if amount == 0 {
            return;
        }
        *self.counts.entry(kind).or_default() += amount;
    }

    pub fn get(&self, kind: ResourceKind) -> u32 {
        self.counts.get(&kind).copied().unwrap_or_default()
    }

    pub fn has(&self, kind: ResourceKind, amount: u32) -> bool {
        self.get(kind) >= amount
    }

    pub fn consume(&mut self, kind: ResourceKind, amount: u32) -> bool {
        if amount == 0 {
            return true;
        }
        let Some(current) = self.counts.get_mut(&kind) else {
            return false;
        };
        if *current < amount {
            return false;
        }
        *current -= amount;
        if *current == 0 {
            self.counts.remove(&kind);
        }
        true
    }

    pub fn drain_one(&mut self) -> Option<ResourceKind> {
        let kind = *self.counts.iter().find(|(_, amount)| **amount > 0)?.0;
        self.consume(kind, 1).then_some(kind)
    }

    pub fn merge(&mut self, other: &mut Inventory) {
        let drained: Vec<(ResourceKind, u32)> = other.counts.drain().collect();
        for (kind, amount) in drained {
            self.add(kind, amount);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.counts.values().all(|amount| *amount == 0)
    }

    pub fn iter(&self) -> impl Iterator<Item = (ResourceKind, u32)> + '_ {
        self.counts.iter().map(|(kind, amount)| (*kind, *amount))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum JobKind {
    Mine {
        target: TileCoord,
    },
    Chop {
        target: TileCoord,
    },
    Build {
        target: TileCoord,
        tile_id: String,
        cost: Inventory,
    },
    Haul {
        from: TileCoord,
        to: TileCoord,
    },
    Explore {
        target: TileCoord,
    },
    Evacuate {
        target: TileCoord,
    },
}

impl JobKind {
    pub fn target(&self) -> TileCoord {
        match self {
            Self::Mine { target }
            | Self::Chop { target }
            | Self::Build { target, .. }
            | Self::Explore { target }
            | Self::Evacuate { target } => *target,
            Self::Haul { from, .. } => *from,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum JobStatus {
    Queued,
    Assigned(EntityId),
    Done,
    Failed,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Job {
    pub id: EntityId,
    pub kind: JobKind,
    pub status: JobStatus,
    pub progress: u32,
    pub failure_reason: Option<String>,
}

impl Job {
    pub fn new(id: EntityId, kind: JobKind) -> Self {
        Self {
            id,
            kind,
            status: JobStatus::Queued,
            progress: 0,
            failure_reason: None,
        }
    }

    pub fn is_open(&self) -> bool {
        matches!(self.status, JobStatus::Queued | JobStatus::Assigned(_))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkerStatus {
    Idle,
    Walking,
    Working,
    Hauling,
    Evacuating,
    Hungry,
    Downed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Worker {
    pub id: EntityId,
    pub name: String,
    pub pos: TileCoord,
    pub status: WorkerStatus,
    pub assigned_job: Option<EntityId>,
    pub carrying: Inventory,
    pub hunger: i32,
    pub health: i32,
}

impl Worker {
    pub fn new(id: EntityId, name: impl Into<String>, pos: TileCoord) -> Self {
        Self {
            id,
            name: name.into(),
            pos,
            status: WorkerStatus::Idle,
            assigned_job: None,
            carrying: Inventory::default(),
            hunger: 100,
            health: 100,
        }
    }

    pub fn can_work(&self) -> bool {
        self.health > 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Monster {
    pub id: EntityId,
    pub pos: TileCoord,
    pub health: i32,
    pub attack_cooldown: u32,
}

impl Monster {
    pub fn new(id: EntityId, pos: TileCoord) -> Self {
        Self {
            id,
            pos,
            health: 30,
            attack_cooldown: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ItemPile {
    pub pos: TileCoord,
    pub items: Inventory,
}

impl ItemPile {
    pub fn new(pos: TileCoord, kind: ResourceKind, amount: u32) -> Self {
        let mut items = Inventory::default();
        items.add(kind, amount);
        Self { pos, items }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Stockpile {
    pub area: TileArea,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoreStorehouse {
    pub area: TileArea,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafeZone {
    pub area: TileArea,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WaterSource {
    pub pos: TileCoord,
    pub max_level: u8,
}

impl WaterSource {
    pub fn new(pos: TileCoord, max_level: u8) -> Self {
        Self {
            pos,
            max_level: max_level.clamp(1, 3),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct OldDam {
    pub pos: TileCoord,
    pub breached: bool,
}

impl OldDam {
    pub fn new(pos: TileCoord) -> Self {
        Self {
            pos,
            breached: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MedalTier {
    Bronze,
    Silver,
    Gold,
}

impl MedalTier {
    pub fn label(self) -> &'static str {
        match self {
            Self::Bronze => "bronze",
            Self::Silver => "silver",
            Self::Gold => "gold",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChallengeKind {
    FloodFortress,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChallengeStatus {
    Setup,
    Running,
    Won(MedalTier),
    Lost { reason: String },
}

impl ChallengeStatus {
    pub fn is_running(&self) -> bool {
        matches!(self, Self::Running)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChallengeGoals {
    pub survive_until_day: u32,
    pub silver_min_survivors: usize,
    pub silver_min_flood_structures: u32,
    pub gold_min_channels: u32,
    pub gold_min_food: u32,
    pub gold_min_wood: u32,
    pub gold_min_stone: u32,
}

impl Default for ChallengeGoals {
    fn default() -> Self {
        Self {
            survive_until_day: 3,
            silver_min_survivors: 3,
            silver_min_flood_structures: 8,
            gold_min_channels: 1,
            gold_min_food: 10,
            gold_min_wood: 10,
            gold_min_stone: 5,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ChallengeScore {
    pub total_workers: usize,
    pub surviving_workers: usize,
    pub flooded_tiles: usize,
    pub core_wet_ticks: u32,
    pub flood_structures_built: u32,
    pub channels_dug: u32,
    pub remaining_food: u32,
    pub remaining_wood: u32,
    pub remaining_stone: u32,
    pub medal: Option<MedalTier>,
    pub failure_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct FloodStats {
    pub max_flooded_tiles: usize,
    pub core_wet_ticks: u32,
    pub flood_structures_built: u32,
    pub channels_dug: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FloodFortressState {
    pub breach_tick: u64,
    pub old_dams: Vec<OldDam>,
    pub water_sources: Vec<WaterSource>,
    pub water_levels: HashMap<TileCoord, u8>,
    pub core_flood_ticks: u32,
    pub stats: FloodStats,
}

impl FloodFortressState {
    pub fn new(
        started_tick: u64,
        old_dams: Vec<OldDam>,
        water_sources: Vec<WaterSource>,
        breach_after_ticks: u64,
    ) -> Self {
        let water_levels = water_sources
            .iter()
            .map(|source| (source.pos, source.max_level))
            .collect();
        Self {
            breach_tick: started_tick.saturating_add(breach_after_ticks),
            old_dams,
            water_sources,
            water_levels,
            core_flood_ticks: 0,
            stats: FloodStats::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChallengeState {
    pub kind: ChallengeKind,
    pub status: ChallengeStatus,
    pub started_tick: u64,
    pub goals: ChallengeGoals,
    pub flood: FloodFortressState,
    pub score: ChallengeScore,
}

impl ChallengeState {
    pub fn flood_fortress(
        started_tick: u64,
        old_dams: Vec<OldDam>,
        water_sources: Vec<WaterSource>,
        breach_after_ticks: u64,
    ) -> Self {
        Self {
            kind: ChallengeKind::FloodFortress,
            status: ChallengeStatus::Running,
            started_tick,
            goals: ChallengeGoals::default(),
            flood: FloodFortressState::new(
                started_tick,
                old_dams,
                water_sources,
                breach_after_ticks,
            ),
            score: ChallengeScore::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameTime {
    pub tick: u64,
    pub day: u32,
    pub minute_of_day: u32,
}

impl Default for GameTime {
    fn default() -> Self {
        Self {
            tick: 0,
            day: 1,
            minute_of_day: 8 * 60,
        }
    }
}

impl GameTime {
    pub fn advance(&mut self, minutes_per_tick: u32) {
        self.tick = self.tick.wrapping_add(1);
        self.minute_of_day += minutes_per_tick.max(1);
        while self.minute_of_day >= 24 * 60 {
            self.minute_of_day -= 24 * 60;
            self.day += 1;
        }
    }

    pub fn is_night(self) -> bool {
        self.minute_of_day < 6 * 60 || self.minute_of_day >= 20 * 60
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FogMemory {
    pub reveal_radius: i32,
    pub explored: HashSet<TileCoord>,
    pub visible: HashSet<TileCoord>,
}

impl Default for FogMemory {
    fn default() -> Self {
        Self {
            reveal_radius: 8,
            explored: HashSet::new(),
            visible: HashSet::new(),
        }
    }
}

impl FogMemory {
    pub fn reveal(&mut self, center: TileCoord) {
        let radius = self.reveal_radius.max(1);
        for y in center.y - radius..=center.y + radius {
            for x in center.x - radius..=center.x + radius {
                let coord = TileCoord::new(x, y);
                let dx = x - center.x;
                let dy = y - center.y;
                if dx * dx + dy * dy <= radius * radius {
                    self.explored.insert(coord);
                    self.visible.insert(coord);
                }
            }
        }
    }

    pub fn begin_frame(&mut self) {
        self.visible.clear();
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameEvent {
    pub tick: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub next_id: EntityId,
    pub workers: HashMap<EntityId, Worker>,
    pub monsters: HashMap<EntityId, Monster>,
    pub jobs: Vec<Job>,
    pub stockpiles: Vec<Stockpile>,
    pub core_storehouse: Option<CoreStorehouse>,
    pub safe_zone: Option<SafeZone>,
    pub item_piles: HashMap<TileCoord, ItemPile>,
    pub inventory: Inventory,
    pub time: GameTime,
    pub fog: FogMemory,
    pub challenge: Option<ChallengeState>,
    pub events: VecDeque<GameEvent>,
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            next_id: 1,
            workers: HashMap::new(),
            monsters: HashMap::new(),
            jobs: Vec::new(),
            stockpiles: Vec::new(),
            core_storehouse: None,
            safe_zone: None,
            item_piles: HashMap::new(),
            inventory: Inventory::default(),
            time: GameTime::default(),
            fog: FogMemory::default(),
            challenge: None,
            events: VecDeque::with_capacity(128),
        }
    }
}

impl GameState {
    pub fn new_with_worker(pos: TileCoord) -> Self {
        let mut state = Self::default();
        state.spawn_worker("Mason", pos);
        state.stockpiles.push(Stockpile {
            area: TileArea::centered(pos, 2),
        });
        state.emit("Outpost founded.");
        state
    }

    pub fn allocate_id(&mut self) -> EntityId {
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        id
    }

    pub fn spawn_worker(&mut self, name: impl Into<String>, pos: TileCoord) -> EntityId {
        let id = self.allocate_id();
        self.workers.insert(id, Worker::new(id, name, pos));
        self.fog.reveal(pos);
        id
    }

    pub fn spawn_monster(&mut self, pos: TileCoord) -> EntityId {
        let id = self.allocate_id();
        self.monsters.insert(id, Monster::new(id, pos));
        self.emit(format!(
            "A hostile creature appeared at {},{}.",
            pos.x, pos.y
        ));
        id
    }

    pub fn push_job(&mut self, kind: JobKind) -> EntityId {
        let id = self.allocate_id();
        self.jobs.push(Job::new(id, kind));
        id
    }

    pub fn add_item_pile(&mut self, pos: TileCoord, kind: ResourceKind, amount: u32) {
        self.item_piles
            .entry(pos)
            .and_modify(|pile| pile.items.add(kind, amount))
            .or_insert_with(|| ItemPile::new(pos, kind, amount));
    }

    pub fn stockpile_target(&self) -> Option<TileCoord> {
        self.stockpiles
            .first()
            .map(|stockpile| stockpile.area.center())
    }

    pub fn set_core_storehouse(&mut self, area: TileArea) {
        self.core_storehouse = Some(CoreStorehouse { area });
        if self.stockpiles.is_empty() {
            self.stockpiles.push(Stockpile { area });
        }
        self.emit(format!(
            "Core storehouse set {},{} to {},{}.",
            area.min_x, area.min_y, area.max_x, area.max_y
        ));
    }

    pub fn set_safe_zone(&mut self, area: TileArea) {
        self.safe_zone = Some(SafeZone { area });
        self.emit(format!(
            "Safe zone set {},{} to {},{}.",
            area.min_x, area.min_y, area.max_x, area.max_y
        ));
    }

    pub fn start_flood_fortress(
        &mut self,
        core_area: TileArea,
        old_dams: Vec<OldDam>,
        water_sources: Vec<WaterSource>,
        breach_after_ticks: u64,
    ) {
        self.set_core_storehouse(core_area);
        self.challenge = Some(ChallengeState::flood_fortress(
            self.time.tick,
            old_dams,
            water_sources,
            breach_after_ticks,
        ));
        self.emit("Flood Fortress challenge armed. The old dam is counting down.");
    }

    pub fn water_level(&self, coord: TileCoord) -> u8 {
        self.challenge
            .as_ref()
            .map(|challenge| {
                challenge
                    .flood
                    .water_levels
                    .get(&coord)
                    .copied()
                    .unwrap_or(0)
            })
            .unwrap_or(0)
    }

    pub fn challenge_status(&self) -> Option<&ChallengeStatus> {
        self.challenge.as_ref().map(|challenge| &challenge.status)
    }

    pub fn emit(&mut self, message: impl Into<String>) {
        if self.events.len() >= 128 {
            self.events.pop_front();
        }
        self.events.push_back(GameEvent {
            tick: self.time.tick,
            message: message.into(),
        });
    }

    pub fn open_job_count(&self) -> usize {
        self.jobs.iter().filter(|job| job.is_open()).count()
    }

    pub fn idle_worker_count(&self) -> usize {
        self.workers
            .values()
            .filter(|worker| worker.assigned_job.is_none() && worker.can_work())
            .count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn area_iter_is_inclusive_and_row_major() {
        let area = TileArea::rect(TileCoord::new(1, 2), TileCoord::new(2, 3));
        let coords: Vec<_> = area.iter().collect();
        assert_eq!(
            coords,
            vec![
                TileCoord::new(1, 2),
                TileCoord::new(2, 2),
                TileCoord::new(1, 3),
                TileCoord::new(2, 3),
            ]
        );
    }

    #[test]
    fn inventory_consume_and_drain_one() {
        let mut inventory = Inventory::default();
        inventory.add(ResourceKind::Wood, 2);
        assert!(inventory.consume(ResourceKind::Wood, 1));
        assert_eq!(inventory.get(ResourceKind::Wood), 1);
        assert_eq!(inventory.drain_one(), Some(ResourceKind::Wood));
        assert!(inventory.is_empty());
    }

    #[test]
    fn new_state_has_worker_stockpile_and_fog() {
        let state = GameState::new_with_worker(TileCoord::new(4, 5));
        assert_eq!(state.workers.len(), 1);
        assert_eq!(state.stockpiles.len(), 1);
        assert!(state.fog.explored.contains(&TileCoord::new(4, 5)));
        assert!(!state.events.is_empty());
    }
}
