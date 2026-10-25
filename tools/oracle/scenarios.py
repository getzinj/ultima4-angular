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
RUNES, RUNE_HONESTY, LAST_MEDITATED = 0xED0D, 0x80, 0x19
VIRTUE_HONESTY, VIRTUE_SPIRITUALITY = 0xED00, 0xED06
NPC_MOVEMENT_AI, TILE_LORD_BRITISH = 0xEEC0, 0x5E
PARTY_SIZE, PLAYER_1_EXPERIENCE_HI, MOVE_COUNTER = 0x0F, 0xEC1C, 0x1C
BACKSPACE = 0x08
TILE_XPOS, TILE_YPOS, WORLD_MAP = 0x02, 0x03, 0xE800
PARTY_STATS = 0xED00
TORCHES, KEYS, SEXTANT, STONES = 0xED08, 0xED0A, 0xED0B, 0xED0C
BELL_BOOK_CANDLE, THREEPARTKEY, FOOD_HI, FOOD_LO, FOOD_FRAC = 0xED0E, 0xED0F, 0xED10, 0xED11, 0xED12
WHEEL, SKULL = 0xED16, 0xED17
ARMOUR, WEAPONS = PARTY_STATS + 0x18, PARTY_STATS + 0x20
CTRL_V = 0x16
TILE_CHEST, TILE_WHIRLPOOL, TILE_RAT = 0x3C, 0x8C, 0x90
TILE_SWAMP, TILE_BRIDGE_NARROW, TILE_FIELD_POISON, TILE_FIELD_FIRE, TILE_FIELD_SLEEP, TILE_LAVA = 0x03, 0x17, 0x44, 0x46, 0x47, 0x4C
TILE_WALK, TILE_GRASS, TILE_BALLOON, TILE_HUMAN_PRONE, TILE_DOOR_LOCKED = 0x1F, 0x04, 0x18, 0x38, 0x3A
STATUS_GOOD, PLAYER_STATUS, PLAYER_SIZE, MODE_COMBAT = 0xC7, 0xEC12, 0x20, 0x80
TOWNE_MAP, BRITANNIA_X, BRITANNIA_Y, ITEMS_OPENED_ABYSS = 0xE800, 0x08, 0x09, 0x77
DISK_PROMPT = 300
GOLD_HI, GOLD_LO, PLAYER_1_CLASS, CLASS_SHEPHERD = 0xED13, 0xED14, 0xEC11, 0x07
NPC_DIALOGUE, TILE_FLOOR_BRICK, TILE_VILLAGER, TILE_BEGGAR, AI_HOSTILE = 0xEEE0, 0x3E, 0x20, 0x58, 0xFF
# Moonglow's townsfolk, by their records on the towne disk's track 4, numbered from one.
MARIAH, CROMWELL, PATRIC, CALABRINI = 0x01, 0x03, 0x06, 0x0D
# TMAP's entry, which SEAR's telescope calls once the map is loaded.
VIEW_MAP = 0x9000


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


def keys(session, *pressed):
    """Keys, each 10 polls after the game has taken the last from its type-ahead buffer, with no wait
    after."""
    for key in pressed:
        session.press(key, polls=10)
        session.run_until(session.memory_is(KEY_BUF_LEN, 0))


def word(text):
    """A word typed and entered."""
    return (*text, RETURN)


def visit_shrine(session, *pressed):
    """A visit to the shrine: E, then the keys at each of its prompts, and back to Britannia."""
    keys(session, 'E', *pressed)
    session.run_until(session.entered('ULT4', 'next_turn'))


def shrines(session):
    """A new game by the shrine of Honesty: turned away without its rune, then with it a vision after
    one cycle, too weary to meditate again, a wrong mantra with spirituality spent (an eighth lost),
    three cycles with honesty at its height for the partial avatarhood and the rune, then no focus
    on the wrong virtue. (No cycles is not offered: the check reads the flags of a compare, not the
    count, so it meditates 256 times.)"""
    new_game_at(session, 0xE9, 0x43)
    in_britannia(session)
    command(session, UP)
    visit_shrine(session)
    session.poke(RUNES, RUNE_HONESTY)
    session.poke(LAST_MEDITATED, 0xFF)
    visit_shrine(session, *word('HONESTY'), '1', *word('AHM'), ' ', ' ')
    visit_shrine(session, *word('HON'), '2', ' ')
    session.poke(LAST_MEDITATED, 0xFF)
    session.poke(VIRTUE_SPIRITUALITY, 0x00)
    visit_shrine(session, *'HONX', BACKSPACE, *word('E'), '7', '2', *word('OM'))
    session.poke(LAST_MEDITATED, 0xFF)
    session.poke(VIRTUE_HONESTY, 0x99)
    visit_shrine(session, *word('HONE'), '3', *word('AHM'), *word('AHM'), *word('AHM'), ' ', ' ')
    session.poke(LAST_MEDITATED, 0xFF)
    visit_shrine(session, *word('VALOR'), '1', ' ')
    session.idle(140)
    session.checkpoint()


def talk_to_lord_british(session, *pressed):
    """A talk with Lord British, brought beside the party: T, north, the disk he is on, and the keys
    after."""
    keys(session, 'T', UP, ESC, *pressed)
    session.press_until([ESC], session.entered('ULT4', 'next_turn'), limit=10)


def lord_british(session):
    """A new game into Lord British's castle, with him beside the party: his welcome to a newcomer,
    then every subject he answers (healing declined and taken, help early in the game), one he
    cannot, and farewell; then, with the avatar more experienced and a companion, a level gained and
    help that asks for runes; and with four in the party, his greeting to them all."""
    new_game_at(session, 0x56, 0x6C)
    in_britannia(session)
    command(session, UP)
    keys(session, 'E')
    session.press_until([ESC], session.entered('ULT4', 'next_turn'), limit=10)
    place_object(session, 0x1F, TILE_LORD_BRITISH, 0x0F, 0x1D)
    session.poke(NPC_MOVEMENT_AI + 0x1F, 0x00)
    talk_to_lord_british(
        session, ' ', ' ', ' ',
        *word('NAME'), *word('LOOK'), *word('JOB'), *word('HEAL'), *word('Y'), *word('HEAL'), *word('N'), *word('HEAL'), *word('MAYBE'),
        *word('TRUTH'), *word('LOVE'), *word('COURAGE'), *word('HONESTY'), *word('COMPASSION'), *word('VALOR'), *word('JUSTICE'),
        *word('SACRIFICE'), *word('HONOR'), *word('SPIRITUALITY'), *word('HUMILITY'), ' ', *word('PRIDE'), ' ', *word('AVATAR'), ' ',
        *word('QUEST'), ' ', *word('BRITANNIA'), ' ', ' ', *word('ANKH'), *word('HELP'), ' ', ' ', *word('ABYSS'), ' ', ' ',
        *word('MONDAIN'), *word('MINAX'), *word('EXODUS'), *word('VIRTUE'), ' ', *word('XYZZY'), BACKSPACE, *word('BYE'))
    session.poke(PLAYER_1_EXPERIENCE_HI, 0x04)
    session.poke(PARTY_SIZE, 0x02)
    session.poke(MOVE_COUNTER + 1, 0x01)
    talk_to_lord_british(session, *word('HELP'), ' ', ' ', ' ', *word('BYE'))
    session.poke(PARTY_SIZE, 0x04)
    talk_to_lord_british(session, *word('BYE'))
    session.idle(140)
    session.checkpoint()


def in_combat(session):
    return session.machine.memory.ram[GAME_MODE] & MODE_COMBAT != 0


def fight(session):
    """Attack to the north until the fight is over."""
    for _ in range(60):
        if not in_combat(session):
            break
        combat_turn(session, 'A', UP)


def set_world_tile(session, tile):
    """The tile under the party, in the world's four chunks held, as SUBS's gettile_britannia finds it."""
    x = session.machine.memory.ram[TILE_XPOS]
    y = session.machine.memory.ram[TILE_YPOS]
    session.poke(WORLD_MAP + (((((y & 0x10) << 1) | x) >> 4) << 8) + (((y & 0x0F) << 4) | (x & 0x0F)), tile)


def commands(session):
    """A new game by Britain, with three in the party, a sextant, a torch and arms: Locate; Ignite,
    then with none left; Ztats through every page each way; Ready and Wear, each taken, refused,
    lacking and aborted; New order; the volume and music off and on; starving; four chests, trapped
    and not; Attack where nothing is, at a whirlpool and at a rat, fought with Ztats and Ready in
    the fight; on a ship, Fire not broadside and broadside at pirates; Fire on foot; then a turn
    each on swamp, fire, sleep, poison and lava, three on a bridge; and Quit."""
    new_game_at(session, 0xE7, 0x88)
    for address, value in ((PARTY_SIZE, 0x03), (TORCHES, 0x01), (SEXTANT, 0x01), (STONES, 0x81), (RUNES, 0x42),
                           (BELL_BOOK_CANDLE, 0x07), (THREEPARTKEY, 0x05), (HORN, 0x01), (WHEEL, 0x01), (SKULL, 0x01),
                           (WEAPONS + 2, 0x02), (WEAPONS + 3, 0x01), (WEAPONS + 4, 0x01), (WEAPONS + 7, 0x12),
                           (ARMOUR + 1, 0x01), (ARMOUR + 2, 0x01), (PLAYER_1_DEXTERITY, 0x01)):
        session.poke(address, value)
    in_britannia(session)
    command(session, 'L')
    command(session, 'I')
    command(session, 'I')
    command(session, 'Z', '0', *([RIGHT] * 9), *([LEFT] * 5), 'X')
    command(session, 'Z', '5')
    for pressed in (('1', 'C'), ('1', 'E'), ('1', 'G'), ('1', 'H'), ('1', 'A'), ('1', 'Z'), ('7',)):
        command(session, 'R', *pressed)
    for pressed in (('1', 'C'), ('1', 'A'), ('1', 'B'), ('1', 'Q'), ('4',)):
        command(session, 'W', *pressed)
    for pressed in (('2', '3'), ('1',), ('2', '2'), ('4',), ('3', '1'), ('X',)):
        command(session, 'N', *pressed)
    command(session, 'V')
    command(session, 'V')
    command(session, CTRL_V)
    command(session, CTRL_V)
    session.poke(FOOD_HI, 0x00)
    session.poke(FOOD_LO, 0x00)
    session.poke(FOOD_FRAC, 0x00)
    command(session, ' ')
    session.poke(FOOD_LO, 0x50)
    for chest in range(4):
        place_object(session, 0x10 + chest, TILE_CHEST, 0xE7, 0x88)
        command(session, ' ')
        command(session, 'G', '1')
        for player in range(3):
            session.poke(PLAYER_STATUS + player * PLAYER_SIZE, STATUS_GOOD)
    command(session, 'G', '4')
    command(session, 'G', 'X')
    for player in range(3):
        for address, value in ((PLAYER_1_STRENGTH, 0x50), (PLAYER_1_DEXTERITY, 0x50), (PLAYER_1_HP_HI, 0x09),
                               (PLAYER_1_MAX_HP_HI, 0x09), (PLAYER_1_WEAPON, WEAPON_SWORD)):
            session.poke(address + player * PLAYER_SIZE, value)
    combat_turn(session, 'A', UP)
    place_object(session, 0x00, TILE_WHIRLPOOL, 0xE7, 0x87)
    combat_turn(session, 'A', UP)
    place_object(session, 0x00, TILE_RAT, 0xE7, 0x87)
    combat_turn(session, 'A', UP)
    combat_turn(session, 'Z', RIGHT, 'X')
    combat_turn(session, 'R', 'B')
    fight(session)
    session.poke(PLAYER_TRANSPORT, TILE_SHIP_WEST)
    command(session, 'F', LEFT)
    command(session, 'F', UP)
    place_object(session, 0x08, TILE_PIRATE, 0xE7, 0x86)
    command(session, 'F', UP)
    place_object(session, 0x01, TILE_PIRATE, 0xE7, 0x8A)
    command(session, 'F', DOWN)
    command(session, 'F', DOWN)
    session.poke(PLAYER_TRANSPORT, TILE_WALK)
    command(session, 'F')
    for tile in (TILE_SWAMP, TILE_FIELD_FIRE, TILE_FIELD_SLEEP, TILE_FIELD_POISON, TILE_LAVA):
        set_world_tile(session, tile)
        combat_turn(session, ' ')
    set_world_tile(session, TILE_BRIDGE_NARROW)
    for _ in range(3):
        combat_turn(session, ' ')
    set_world_tile(session, TILE_GRASS)
    command(session, 'Q')
    session.idle(140)
    session.checkpoint()


def answer_disk_prompt(session):
    """ESC once the game waits at its disk prompt, and on to the next turn."""
    session.idle(DISK_PROMPT)
    keys(session, ESC)
    session.run_until(session.entered('ULT4', 'next_turn'))


def enter(session):
    """E at a place, and its disk."""
    keys(session, 'E')
    answer_disk_prompt(session)


def leave_to(session, x, y, *pressed):
    """Off a towne's west edge, or up a dungeon's ladder, to (x, y) in Britannia, its disk asked for."""
    session.poke(BRITANNIA_X, x)
    session.poke(BRITANNIA_Y, y)
    keys(session, *pressed)
    answer_disk_prompt(session)


def walk_off_towne(session, x, y):
    session.poke(PLAYER_XPOS, 0x00)
    session.poke(PLAYER_YPOS, 0x0F)
    leave_to(session, x, y, LEFT)


def townes(session):
    """A new game by Moonglow with eight in the party and a key: into the towne, where Mariah, who
    has joined, is not; a door opened and left to close, a wall, a locked door that will not open,
    jimmied, jimmied again, and with no key; three of the towne's chests and one dropped; a sleeper
    attacked and fought; then out to Deceit, entered on a horse and on foot and climbed out of to
    Paws, a village; Magincia, a ruin; the Lycaeum, a castle; the Abyss, shut and opened; and Enter
    in a balloon and where nothing is."""
    new_game_at(session, 0xE8, 0x87)
    session.poke(PARTY_SIZE, 0x08)
    session.poke(KEYS, 0x01)
    in_britannia(session)
    enter(session)
    session.poke(PLAYER_XPOS, 0x19)
    session.poke(PLAYER_YPOS, 0x02)
    command(session, 'O', RIGHT)
    for _ in range(5):
        combat_turn(session, ' ')
    command(session, 'O', UP)
    session.poke(TOWNE_MAP + 0x02 * 0x20 + 0x1A, TILE_DOOR_LOCKED)
    command(session, 'O', RIGHT)
    command(session, 'J', RIGHT)
    command(session, 'J', RIGHT)
    session.poke(TOWNE_MAP + 0x02 * 0x20 + 0x1A, TILE_DOOR_LOCKED)
    command(session, 'J', RIGHT)
    command(session, 'J', LEFT)
    for x, y, player in ((0x1C, 0x01, '1'), (0x1D, 0x01, '2'), (0x1E, 0x02, '3')):
        session.poke(PLAYER_XPOS, x)
        session.poke(PLAYER_YPOS, y)
        command(session, ' ')
        command(session, 'G', player)
    place_object(session, 0x1E, TILE_CHEST, 0x1B, 0x02)
    session.poke(PLAYER_XPOS, 0x1B)
    session.poke(PLAYER_YPOS, 0x02)
    command(session, ' ')
    command(session, 'G', '4')
    for player in range(8):
        for address, value in ((PLAYER_STATUS, STATUS_GOOD), (PLAYER_1_STRENGTH, 0x50), (PLAYER_1_DEXTERITY, 0x50), (PLAYER_1_WEAPON, WEAPON_SWORD)):
            session.poke(address + player * PLAYER_SIZE, value)
    place_object(session, 0x1E, TILE_HUMAN_PRONE, 0x1C, 0x02)
    session.poke(NPC_MOVEMENT_AI + 0x1E, 0x00)
    combat_turn(session, 'A', RIGHT)
    fight(session)
    walk_off_towne(session, 0xF0, 0x49)
    session.poke(PLAYER_TRANSPORT, TILE_HORSE_WEST)
    command(session, 'E')
    session.poke(PLAYER_TRANSPORT, TILE_WALK)
    enter(session)
    leave_to(session, 0x62, 0x91, 'K')
    enter(session)
    walk_off_towne(session, 0xBB, 0xA9)
    enter(session)
    walk_off_towne(session, 0xDA, 0x6B)
    enter(session)
    walk_off_towne(session, 0xE9, 0xE9)
    command(session, 'E')
    session.poke(BELL_BOOK_CANDLE, ITEMS_OPENED_ABYSS)
    enter(session)
    leave_to(session, 0xE9, 0xE9, 'K')
    session.poke(PLAYER_TRANSPORT, TILE_BALLOON)
    command(session, 'E')
    session.poke(PLAYER_TRANSPORT, TILE_WALK)
    command(session, UP)
    command(session, 'E')
    session.idle(140)
    session.checkpoint()


def talk_to(session, direction, *pressed):
    """T, a direction, the keys said, and on to the next turn."""
    keys(session, 'T', direction, *pressed)
    session.run_until(session.entered('ULT4', 'next_turn'))


def place_townsperson(session, slot, tile, x, y, dialogue):
    """A townsperson, still, on floor at (x, y), with the record `dialogue` on the towne disk's track
    for the towne."""
    place_object(session, slot, tile, x, y)
    session.poke(NPC_MOVEMENT_AI + slot, 0x00)
    session.poke(NPC_DIALOGUE + slot, dialogue)
    session.poke(TOWNE_MAP + y * 0x20 + x, TILE_FLOOR_BRICK)


def townsfolk(session):
    """A new game into Moonglow, the party at (0F,0F): Talk to no one, to one with nothing to say, and
    to Cromwell, asked everything, his own words, and his question answered after an answer that is
    neither; Patric's question of humility answered no and yes; a beggar given gold, more than there
    is, and the last of it; Mariah asked to join, short of experience and then with it; a townsman
    turned hostile, fought; the rune found and not found again; the horn and the skull used; then
    the Lycaeum, its book found and its telescope turned to Moonglow, and to a letter it lacks."""
    new_game_at(session, 0xE8, 0x87)
    session.poke(GOLD_HI, 0x00)
    session.poke(GOLD_LO, 0x30)
    session.poke(PLAYER_1_CLASS, CLASS_SHEPHERD)
    session.poke(PARTY_STATS, 0x50)
    in_britannia(session)
    enter(session)
    session.poke(PLAYER_XPOS, 0x0F)
    session.poke(PLAYER_YPOS, 0x0F)
    for x, y in ((0x10, 0x0F), (0x0E, 0x0F), (0x0F, 0x0E), (0x0F, 0x10)):
        session.poke(TOWNE_MAP + y * 0x20 + x, TILE_FLOOR_BRICK)
    command(session, ' ')
    talk_to(session, DOWN)
    place_townsperson(session, 0x10, TILE_VILLAGER, 0x0F, 0x10, 0x00)
    talk_to(session, DOWN)
    place_townsperson(session, 0x10, TILE_VILLAGER, 0x10, 0x0F, CROMWELL)
    talk_to(session, RIGHT, *word('NAME'), *word('LOOK'), *word('JOB'), *word('HEAL'), *word('MANTRA'), *word('XYZZY'),
            *word('HONESTY'), RETURN, *word('MAYBE'), *word('YES'), *word('BYE'))
    place_townsperson(session, 0x10, TILE_VILLAGER, 0x10, 0x0F, PATRIC)
    talk_to(session, RIGHT, *word('HUMILITY'), RETURN, *word('N'), *word('HUMI'), RETURN, *word('Y'), *word('BYE'))
    place_townsperson(session, 0x10, TILE_BEGGAR, 0x10, 0x0F, CALABRINI)
    talk_to(session, RIGHT, *word('GIVE'), *word('5'), *word('GIVE'), *word('99'), *word('GIVE'), *word('25'), *word('BYE'))
    place_townsperson(session, 0x1F, TILE_VILLAGER, 0x0F, 0x0E, MARIAH)
    session.poke(PLAYER_1_MAX_HP_HI, 0x01)
    talk_to(session, UP, *word('JOIN'), *word('BYE'))
    session.poke(PLAYER_1_MAX_HP_HI, 0x02)
    talk_to(session, UP, *word('JOIN'))
    for player in range(2):
        for address, value in ((PLAYER_STATUS, STATUS_GOOD), (PLAYER_1_STRENGTH, 0x50), (PLAYER_1_DEXTERITY, 0x50), (PLAYER_1_WEAPON, WEAPON_SWORD)):
            session.poke(address + player * PLAYER_SIZE, value)
    place_townsperson(session, 0x10, TILE_BEGGAR, 0x0F, 0x0E, CALABRINI)
    session.poke(NPC_MOVEMENT_AI + 0x10, AI_HOSTILE)
    combat_turn(session, ' ')
    fight(session)
    session.poke(PLAYER_XPOS, 0x08)
    session.poke(PLAYER_YPOS, 0x06)
    command(session, 'S')
    command(session, 'S')
    session.poke(HORN, 0x01)
    session.poke(SKULL, 0x01)
    command(session, 'U', *word('HORN'))
    command(session, 'U', *word('SKULL'))
    walk_off_towne(session, 0xDA, 0x6B)
    enter(session)
    session.poke(PLAYER_XPOS, 0x06)
    session.poke(PLAYER_YPOS, 0x06)
    command(session, 'S')
    session.poke(PLAYER_XPOS, 0x16)
    session.poke(PLAYER_YPOS, 0x03)
    keys(session, 'S', 'E')
    session.run_until(lambda: session.machine.mpu.pc == VIEW_MAP)
    session.idle(40)
    keys(session, RETURN)
    session.run_until(session.entered('ULT4', 'next_turn'))
    command(session, 'S', 'Q')
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
    'shrines': shrines,
    'lord-british': lord_british,
    'commands': commands,
    'townes': townes,
    'townsfolk': townsfolk,
}
