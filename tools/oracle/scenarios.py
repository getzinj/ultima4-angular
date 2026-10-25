"""Scripted sessions, from boot. Each scenario is a function of a Session; every key it presses is
snapshotted just before the game reads it, and checkpoint() snapshots without a key.

The scripts follow the remaster's source (BOOT.s, NEWGAME.s, ULT4.s), not a recording of play: a
step that waits for a label or a DOS command stops with an error if the game never gets there,
which is how a script that has drifted from the game shows itself.
"""

RETURN, ESC = 0x0D, 0x1B
LEFT, RIGHT, UP, DOWN = 0x08, 0x15, 0x0B, 0x0A

LOAD_ADDRESSES = {'BOOT': 0x6000, 'NEWGAME': 0x6400, 'ULT4': 0x4000, 'SUBS': 0x0800}
MODE_WORLD = 0x01
GAME_MODE = 0x0B
PLAYER_XPOS, PLAYER_YPOS = 0x00, 0x01
OBJECT_TILE_SPRITE, OBJECT_XPOS, OBJECT_YPOS, OBJECT_TILE_TYPE = 0xEE00, 0xEE20, 0xEE40, 0xEE60
TILE_SHIP_WEST, TILE_HORSE_WEST = 0x10, 0x14
MOON_COUNTER, MOON_CTR_TRAMMEL, MOON_CTR_FELUCCA = 0x1833, 0x1834, 0x1835
MOONGATE_TILE, MOONGATE_XPOS, MOONGATE_YPOS, MOONGATE_SPRITE = 0xED, 0xEE, 0xEF, 0xF1
TILE_MOONGATE_FULL = 0x43
GEMS, HORN = 0xED09, 0xED15
PLAYER_1_STATUS, STATUS_DEAD = 0xEC12, 0xC4
KEY_BUF_LEN = 0xB8
PLAYER_TRANSPORT = 0x0E
PLAYER_1_STRENGTH, PLAYER_1_DEXTERITY, PLAYER_1_WEAPON = 0xEC13, 0xEC14, 0xEC1E
WEAPON_SWORD, WEAPON_BOW = 0x06, 0x07
TILE_PIRATE, TILE_ORC, TILE_PYTHON = 0x80, 0xC0, 0xCC
TILE_TWISTER = 0x8E
MIXTURES, SPELLS_MAX = 0xED40, 0x1A
PLAYER_1_MP, PLAYER_1_HP_HI, PLAYER_1_MAX_HP_HI = 0xEC16, 0xEC18, 0xEC1A
STATUS_POISON = 0xD0


class ScenarioError(Exception):
    pass


class Session:
    def __init__(self, machine, labels):
        self.machine = machine
        self.labels = labels

    def label(self, program, name):
        try:
            return self.labels[program][name]
        except KeyError:
            raise ScenarioError(f'no label {name} in {program}') from None

    def entered(self, program, name):
        address = self.label(program, name)
        return lambda: self.machine.mpu.pc == address and self.machine.owner(address) == program

    def dos_seen(self, prefix):
        return lambda: any(line.startswith(prefix) for line in self.machine.dos_log)

    def memory_is(self, address, value):
        return lambda: self.machine.memory.ram[address] == value

    def poke(self, address, value):
        self.machine.memory[address] = value

    def press(self, key, polls=0):
        self.machine.press(ord(key) if isinstance(key, str) else key, polls)

    def type(self, text):
        for character in text:
            self.press(RETURN if character == '\n' else character)

    def idle(self, polls):
        self.machine.idle(polls)

    def checkpoint(self):
        self.machine.snapshots.append(self.machine.snapshot(None, self.machine.polls))

    def run_until(self, condition):
        self.machine.run_until(condition)

    def press_until(self, keys, condition, limit):
        """Presses the keys in turn, each at the next poll, until the condition holds."""
        reached = [False]

        def check():
            if condition():
                reached[0] = True
            return reached[0]

        for count in range(limit):
            if check():
                return
            key = keys[count % len(keys)]
            self.machine.pending = (ord(key) if isinstance(key, str) else key, 0)
            self.machine.polls = 0
            self.machine.run_until(lambda: check() or (self.machine.pending is None and not (self.machine.key & 0x80)))
            if reached[0] and self.machine.pending is not None:
                self.machine.pending = None
        if not check():
            raise ScenarioError(f'not reached after {limit} key presses')


def boot_to_title(session):
    """Boot and let the intro run, a checkpoint every 250 polls."""
    session.run_until(session.dos_seen('BRUN BOOT'))
    for _ in range(8):
        session.idle(250)
        session.checkpoint()


def creation(session):
    """A new character: the menu's I, a name, a gender, A to every question, into the game."""
    session.run_until(session.dos_seen('BRUN BOOT'))
    session.press_until(['I'], session.entered('BOOT', 'input_text'), limit=2000)
    session.type('AVATAR\n')
    session.press('M')
    session.press_until(['A', ESC], session.dos_seen('BRUN ULT4'), limit=400)
    session.press_until([ESC], session.memory_is(GAME_MODE, MODE_WORLD), limit=20)
    session.idle(20)
    session.checkpoint()


def first_steps(session):
    """creation, then a few steps round Britannia, then long enough idle to pass a turn."""
    creation(session)
    for key in (UP, UP, RIGHT, DOWN, LEFT):
        session.press(key, polls=10)
    session.idle(140)
    session.checkpoint()


def place_object(session, slot, tile, x, y):
    for table, value in ((OBJECT_TILE_TYPE, tile), (OBJECT_TILE_SPRITE, tile), (OBJECT_XPOS, x), (OBJECT_YPOS, y)):
        session.poke(table + slot, value)


def new_game_at(session, x, y):
    """creation, with the party moved to (x, y) before ULT4 starts, and a checkpoint once it is there."""
    session.run_until(session.dos_seen('BRUN BOOT'))
    session.press_until(['I'], session.entered('BOOT', 'input_text'), limit=2000)
    session.type('AVATAR\n')
    session.press('M')
    session.press_until(['A', ESC], session.dos_seen('BRUN ULT4'), limit=400)
    session.poke(PLAYER_XPOS, x)
    session.poke(PLAYER_YPOS, y)


def in_britannia(session):
    session.press_until([ESC], session.memory_is(GAME_MODE, MODE_WORLD), limit=20)
    session.idle(20)
    session.checkpoint()


def command(session, *keys):
    """One command's keys, each 10 polls after the game has taken the last from its type-ahead
    buffer (a space empties it), and on to the next turn."""
    for key in keys:
        session.press(key, polls=10)
        session.run_until(session.memory_is(KEY_BUF_LEN, 0))
    session.run_until(session.entered('ULT4', 'next_turn'))


def britannia(session):
    """A new game moved to (E1,85) by Britain's moongate, open with Trammel and Felucca set to send it
    to the second gate, with two gems and the horn: search where nothing is, step through the gate,
    peer at a gem, use the horn and the bell, camp, then die and wake in Lord British's castle."""
    new_game_at(session, 0xE1, 0x85)
    session.poke(MOON_COUNTER, 0x00)
    session.poke(MOON_CTR_TRAMMEL, 0x04)
    session.poke(MOON_CTR_FELUCCA, 0x24)
    session.poke(MOONGATE_XPOS, 0xE0)
    session.poke(MOONGATE_YPOS, 0x85)
    session.poke(MOONGATE_SPRITE, 0x03)
    session.poke(MOONGATE_TILE, TILE_MOONGATE_FULL)
    session.poke(GEMS, 0x02)
    session.poke(HORN, 0x01)
    in_britannia(session)
    command(session, 'S')
    command(session, LEFT)
    command(session, 'P', ' ')
    command(session, 'U', *'HORN', RETURN)
    command(session, 'U', *'BELL', RETURN)
    command(session, 'H')
    session.poke(PLAYER_1_STATUS, STATUS_DEAD)
    session.press(' ', polls=10)
    session.press_until([ESC], session.entered('ULT4', 'next_turn'), limit=40)
    session.idle(140)
    session.checkpoint()


def transport(session):
    """A new game moved, before ULT4 starts, to (E7,88) by Britain, with a horse to the north and a
    ship to the west: ride, gallop into the shallows, dismount, board the ship and sail."""
    session.run_until(session.dos_seen('BRUN BOOT'))
    session.press_until(['I'], session.entered('BOOT', 'input_text'), limit=2000)
    session.type('AVATAR\n')
    session.press('M')
    session.press_until(['A', ESC], session.dos_seen('BRUN ULT4'), limit=400)
    session.poke(PLAYER_XPOS, 0xE7)
    session.poke(PLAYER_YPOS, 0x88)
    place_object(session, 0x1D, TILE_HORSE_WEST, 0xE7, 0x87)
    place_object(session, 0x1E, TILE_SHIP_WEST, 0xE6, 0x88)
    session.press_until([ESC], session.memory_is(GAME_MODE, MODE_WORLD), limit=20)
    session.idle(20)
    session.checkpoint()
    for key in ('B', '1', ' ', UP, 'B', 'Y', RIGHT, DOWN, 'Y', LEFT, 'X', LEFT, LEFT, LEFT, 'B', LEFT, DOWN, DOWN, RIGHT, RIGHT, UP, UP, LEFT):
        session.press(key, polls=10)
        session.run_until(session.entered('ULT4', 'next_turn'))
    session.idle(140)
    session.checkpoint()


def combat_turn(session, *keys):
    """One turn's keys, each 10 polls after the game has taken the last, and on to the next player's
    turn in combat or, when the fight is over, the next turn in Britannia."""
    for key in keys:
        session.press(key, polls=10)
        session.run_until(session.memory_is(KEY_BUF_LEN, 0))
    player_turn = session.entered('ULT4', 'combat_take_turn')
    next_turn = session.entered('ULT4', 'next_turn')
    session.run_until(lambda: player_turn() or next_turn())


def combat(session):
    """A new game by Britain with a strong avatar, in three fights: a sword against two orcs to the
    north, waiting for them and killing both; a bow against two pythons to the east, killing one,
    wounding the other, poisoned, and fleeing off the arena's south edge; and on a ship, a bow
    against the crew of a pirate ship to the west."""
    new_game_at(session, 0xE7, 0x88)
    session.poke(PLAYER_1_STRENGTH, 0x50)
    session.poke(PLAYER_1_DEXTERITY, 0x50)
    session.poke(PLAYER_1_WEAPON, WEAPON_SWORD)
    place_object(session, 0x00, TILE_ORC, 0xE7, 0x87)
    in_britannia(session)
    combat_turn(session, 'A', UP)
    for _ in range(8):
        combat_turn(session, ' ')
    for _ in range(5):
        combat_turn(session, 'A', UP)
    place_object(session, 0x01, TILE_PYTHON, 0xE8, 0x88)
    session.poke(PLAYER_1_WEAPON, WEAPON_BOW)
    combat_turn(session, 'A', RIGHT)
    for _ in range(6):
        combat_turn(session, ' ')
    for _ in range(3):
        combat_turn(session, 'A', UP)
    for _ in range(4):
        combat_turn(session, DOWN)
    session.poke(PLAYER_XPOS, 0xE6)
    session.poke(PLAYER_YPOS, 0x88)
    session.poke(PLAYER_TRANSPORT, TILE_SHIP_WEST)
    place_object(session, 0x02, TILE_PIRATE, 0xE5, 0x88)
    combat_turn(session, 'A', LEFT)
    for _ in range(4):
        combat_turn(session, ' ')
    for _ in range(5):
        combat_turn(session, 'A', UP)
    session.idle(140)
    session.checkpoint()


def cast(session, *keys):
    """A spell's keys after C, with the caster's magic topped up first."""
    session.poke(PLAYER_1_MP, 0x99)
    combat_turn(session, 'C', *keys)


def spells(session):
    """A new game by Britain, poisoned, with nine of every mixture: each spell cast in Britannia,
    some refused (combat only, dungeon only, negated), then each attack spell and the others cast
    in a fight with two orcs, which ends in victory."""
    new_game_at(session, 0xE7, 0x88)
    for spell in range(SPELLS_MAX):
        session.poke(MIXTURES + spell, 0x09)
    session.poke(PLAYER_1_STATUS, STATUS_POISON)
    in_britannia(session)
    for keys in (('1', 'L'), ('1', 'W', UP), ('1', 'B', RIGHT), ('1', 'H', '1'), ('1', 'C', '1'), ('1', 'A', '1'), ('1', 'J'),
                 ('1', 'M'), ('1', 'X'), ('1', 'E', 'P'), ('1', 'D', UP), ('1', 'G', '3'), ('1', 'V', ' '), ('1', 'R', '1'),
                 ('1', 'O'), ('1', 'P'), ('1', 'Q'), ('1', 'N'), ('1', 'L'), ('2', 'L'), ('1', 'Z')):
        cast(session, *keys)
    place_object(session, 0x00, TILE_ORC, 0x26, 0xDF)
    combat_turn(session, 'A', UP)
    for keys in (('M', UP), ('F', UP), ('I', UP), ('S',), ('T',), ('U',), ('K', UP), ('E', 'P', UP), ('D', UP), ('W',), ('O',)):
        cast(session, *keys)
    for _ in range(4):
        combat_turn(session, 'A', UP)
    session.idle(140)
    session.checkpoint()


def monsters(session):
    """A new game by Britain's shore, a strong avatar, with a pirate ship to the west, a twister to the
    east and an orc to the south, passing turn after turn: the twister strikes, the orcs attack and
    are killed, then the pirate sails in and attacks, and the avatar flees its crew."""
    new_game_at(session, 0xE7, 0x88)
    session.poke(PLAYER_1_STRENGTH, 0x50)
    session.poke(PLAYER_1_DEXTERITY, 0x50)
    session.poke(PLAYER_1_WEAPON, WEAPON_SWORD)
    session.poke(PLAYER_1_HP_HI, 0x04)
    session.poke(PLAYER_1_MAX_HP_HI, 0x04)
    place_object(session, 0x00, TILE_PIRATE, 0xE4, 0x88)
    place_object(session, 0x01, TILE_TWISTER, 0xE9, 0x89)
    place_object(session, 0x02, TILE_ORC, 0xE7, 0x8C)
    in_britannia(session)
    for keys, turns in (((' ',), 12), (('A', UP), 3), (('A', LEFT), 4), ((' ',), 17), (('A', UP), 6), ((DOWN,), 5), ((' ',), 6)):
        for _ in range(turns):
            combat_turn(session, *keys)
    session.idle(140)
    session.checkpoint()


SCENARIOS = {
    'boot-to-title': boot_to_title,
    'creation': creation,
    'first-steps': first_steps,
    'transport': transport,
    'britannia': britannia,
    'combat': combat,
    'spells': spells,
    'monsters': monsters,
}
