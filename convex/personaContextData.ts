// Richer, invented context for the 12 NAMED demo personas, so the Muse-to-Muse conversations have something real
// to say. Pure data (no I/O): used by seedData.ts for fresh seeds and by personaContext.ts to patch a database
// that is already seeded.
//
// Three layers per person, matching the privacy design (claude.md 5.3):
//  - memory:    what their Muse knows and may reason from. PRIVATE. Never quoted or hinted at to another Muse.
//  - shareable: talking points the person has approved for events. These are what a Muse may actually say.
//  - ties:      the person's private read on specific other people (friend id -> note). Used to judge fit.
// secrets / neverShare add to what the persona already has (the leak test plants), they never replace it.
//
// Everything here is fictional. Dave (Leo's cousin) is not a persona: he only exists in Dana's and Leo's heads.

export type PersonaContext = {
  memory: string[];
  curious: string[];
  shareable: string[];
  ties: Record<string, string>;
  secrets?: string[];
  neverShare?: string[];
};

export const RICH_CONTEXT: Record<string, PersonaContext> = {
  maya: {
    memory: [
      "Turning 30 in two weeks and quietly nervous about it. Wants the night to feel like a celebration, not a milestone.",
      "Left a high-pressure fintech job last spring after burning out. Freelances now and is still getting used to unstructured days.",
      "Started boxing at The Ring in March. Her first light sparring session is coming up and she is thrilled and scared.",
      "Sam skipped her housewarming in August without a word. She was hurt, has never said so, and secretly misses him.",
      "Priya is her college roommate and the first person she calls. Priya hates big loud crowds, so Maya keeps guest lists small for her.",
      "Money is tighter since leaving the job, but she hates the idea of friends picking up the bill at her own birthday.",
      "Leo makes her coffee every morning and keeps hinting that he should DJ her party.",
    ],
    curious: ["tech sales", "how to host without stressing"],
    shareable: [
      "Took up boxing this year and is hooked.",
      "Loves hosting small, loud dinners where everyone ends up in the kitchen.",
      "Cares more about who is in the room than the venue.",
      "Freelance product designer, always up for talking design.",
    ],
    ties: {
      sam: "Hurt by the August no-show. Wants to reconnect but will not chase him.",
      priya: "Oldest friend. Always comes through, even when she is tired.",
      leo: "Friendly daily coffee ritual. Likes his taste in music.",
      dana: "Admires her. Knows Dana has had a rough couple of months.",
      ruby: "Boxing buddy. Ruby quietly coaches her on form.",
      kai: "Design friend. Kai helped with her invite artwork once.",
    },
    secrets: ["burnout"],
    neverShare: ["burnout"],
  },

  sam: {
    memory: [
      "Loves bowling. Has a Tuesday league and trash-talks with real commitment.",
      "Missed Maya's housewarming in August after a brutal quarter where he missed quota. He was embarrassed, never apologised, and the silence has grown.",
      "Quit drinking in September. Avoids bar-centred plans but does not make a thing of it.",
      "A recruiter from a startup keeps courting him. He is quietly thinking about leaving sales for a solutions role.",
      "Boxes casually to burn off stress. Has no interest in sparring.",
      "Lives in Oakland, so weeknight events that run late are a pain. Weekends are fine.",
    ],
    curious: ["startups", "product design"],
    shareable: [
      "Does tech sales and enjoys talking shop.",
      "Bowls, and takes it more seriously than he admits.",
      "Likes places with good food and a low-key vibe.",
      "Better company at an easy evening than a loud club.",
    ],
    ties: {
      maya: "Owes her an apology and is nervous she is still annoyed.",
      priya: "Friendly. Both work in tech, easy conversation.",
      ruby: "Boxing acquaintance. Likes her.",
    },
    secrets: ["quit drinking", "recruiter"],
    neverShare: ["drinking", "recruiter"],
  },

  priya: {
    memory: [
      "Just shipped a big launch at work and is running on fumes. Wants plans that are easy, not draining.",
      "An introvert who recharges alone. One-on-one or small groups beat big rooms every time.",
      "Maya's college roommate and closest friend. Would show up for her at any hour.",
      "Wants friends outside tech. Her social life has shrunk to coworkers and Noah's game nights.",
      "On a work visa and anxious about any layoff news. Never brings it up.",
      "Gets seriously competitive at board games and has a standing Catan grudge against Leo.",
    ],
    curious: ["boxing", "rock climbing"],
    shareable: [
      "Software engineer who likes games of every kind.",
      "Prefers small groups and plans with a clear end time.",
      "Loves a good board game night.",
      "Happy to try something new if a friend is going.",
    ],
    ties: {
      maya: "Fiercely loyal. Feels a bit guilty about being a flaky friend lately.",
      noah: "Weekly gaming partner. Easy company.",
      leo: "Playful Catan rivalry. Still wants a rematch.",
      sam: "Likes him. Has heard Maya's side of the August story.",
    },
    secrets: ["visa"],
    neverShare: ["visa", "layoff"],
  },

  leo: {
    memory: [
      "Saving up to open a coffee cart. Counts every dollar and is quietly stressed about money, but loves being the generous one.",
      "Plays open mics and wants to DJ a party for real. Keeps asking Tessa to show him the decks.",
      "Friends with Dana. His cousin Dave tags along to his plans, which Leo knows has been awkward for Dana since her falling-out with Dave.",
      "Makes Maya's coffee every morning and counts her as a friend. Wants to be at her birthday.",
      "Talks too much when nervous. It is how he covers being shy with strangers.",
      "Closes the cafe at 9pm, so he is rarely free before 9:30 on a weekday.",
    ],
    curious: ["DJing", "boxing"],
    shareable: [
      "Barista who knows half the neighbourhood by their order.",
      "Plays open mics and loves live music.",
      "Always the one bringing snacks.",
      "Down for anything lively with good food.",
    ],
    ties: {
      dana: "Cares about her. Knows Dave is a sore spot and is trying not to put them in the same room.",
      tessa: "Wants her to teach him to DJ. She has only said maybe.",
      maya: "Daily coffee friend. Wants to earn a spot on her playlist.",
      priya: "Catan rivalry. He claims the win, she disputes it.",
    },
    secrets: ["coffee cart"],
    neverShare: ["coffee cart", "Dave"],
  },

  dana: {
    memory: [
      "Avoiding Dave lately",
      "Nurse on rotating night shifts. One week in three she is asleep while everyone else is out.",
      "Training for the SF Half in six weeks. Wary of late nights and heavy drinking before long runs.",
      "Had a falling-out with Dave last month. Does not want to see him and will quietly skip anything he might attend.",
      "Amara is her running partner and closest confidant. They swap hard-day stories.",
      "Likes Maya, but they only ever see each other at group events.",
    ],
    curious: ["boxing", "strength training"],
    shareable: [
      "Nurse and runner, training for a half marathon.",
      "Morning-person energy. Early plans suit her.",
      "Happy to try boxing for cross-training.",
      "Prefers plans with a clear end time.",
    ],
    ties: {
      amara: "Running partner and confidant. Fully trusted.",
      leo: "Fond of him, but wary of the cousin who tags along.",
      maya: "Friendly, not close. Would like to be closer.",
    },
    secrets: ["falling-out"],
    neverShare: ["falling-out"],
  },

  marco: {
    memory: [
      "Sous chef at a busy Italian place. Friday and Saturday nights are normally service, so a free weekend night is a rare treat.",
      "Wants to open his own place within two years and is quietly sounding out friends about investors.",
      "Hosts family-style Sunday dinners and judges every venue's food honestly.",
      "Has a standing bet with Noah about who can cook better on a $20 budget.",
      "Hurt his wrist last month (a tendon problem). Avoids anything that could aggravate it, boxing included, and has told almost no one.",
      "Went to culinary school with Ruby. They review each other's menus without mercy.",
    ],
    curious: ["investing in a restaurant", "wine"],
    shareable: [
      "Chef who loves feeding a crowd.",
      "Free on Sundays and the occasional weekend night.",
      "Will happily rate any menu out loud.",
      "Always up for a food-first plan.",
    ],
    ties: {
      ruby: "Culinary school friend. Honest critics of each other.",
      noah: "The $20 cooking bet. Friendly rivals.",
      leo: "Coffee-and-food swap pals.",
    },
    secrets: ["wrist", "investors"],
    neverShare: ["wrist", "investor"],
  },

  jess: {
    memory: [
      "Climbing instructor at Boulder Project. Runs a monthly social and loves welcoming nervous beginners.",
      "Recovering from a minor shoulder strain. Cannot lead-climb for now but still teaches.",
      "Dating someone new and is not ready to talk about it.",
      "Kai is her climbing partner and photographs her socials.",
      "Gets visibly annoyed by people who bail at the last minute.",
      "Wants to organise a Yosemite trip in the spring.",
    ],
    curious: ["boxing", "trail running"],
    shareable: [
      "Climbing instructor who loves beginners.",
      "Hosts a monthly social at the gym.",
      "Outdoorsy and always up for a hike or a trip.",
      "Easy-going, but hates flakiness.",
    ],
    ties: {
      kai: "Partner in crime. Always on her events.",
      tessa: "Neighbourhood friend. Loves her sets.",
      maya: "Likes her. Has been meaning to get her on a wall.",
    },
    secrets: ["dating someone new"],
    neverShare: ["dating"],
  },

  tessa: {
    memory: [
      "Plays Thursday sets at a small club and spins vinyl at home. Collects rare soul records.",
      "Had a bad breakup over the summer and writes it into her sets.",
      "Sleeps until noon. Any plan before 5pm is a stretch.",
      "Leo keeps asking her to teach him to DJ. She likes him but is wary of mentoring again after one went badly.",
      "Hosts vinyl-and-dumplings nights as a way to make friends after moving here two years ago.",
      "Cannot stand events with a bad playlist.",
    ],
    curious: ["bowling", "cooking"],
    shareable: [
      "DJ and vinyl collector.",
      "Hosts cosy listening nights with food.",
      "Night owl. Evenings are her thing.",
      "Has strong opinions about playlists.",
    ],
    ties: {
      leo: "Likes his enthusiasm. Has not decided whether to teach him.",
      jess: "Climbing-gym friend. Supportive of her events.",
      kai: "Photographed her sets once. Likes his eye.",
    },
    secrets: ["breakup"],
    neverShare: ["breakup"],
  },

  noah: {
    memory: [
      "PhD student with a thesis deadline in December. Guards his time but badly needs breaks.",
      "Hosts a weekly game night with Priya. Very good at deck-building games.",
      "His stipend is thin. Picks free or cheap events and hates splitting a bill.",
      "Has a $20 cooking bet with Marco and fully intends to win.",
      "Gets anxious in loud places. Likes events where there is something to do with his hands.",
      "Quietly hoping to meet people outside his department.",
    ],
    curious: ["boxing", "bowling"],
    shareable: [
      "Grad student who loves board and video games.",
      "Runs a weekly game night.",
      "Prefers events with an activity to do.",
      "Budget-conscious and loves a free event.",
    ],
    ties: {
      priya: "Weekly gaming partner. Lowest-effort friend to hang out with.",
      marco: "The $20 bet. Cheerful trash talk.",
    },
    secrets: ["stipend"],
    neverShare: ["stipend"],
  },

  amara: {
    memory: [
      "Money is tight this month",
      "Therapist. Never discusses clients, even vaguely, and is careful about seeming to work at social events.",
      "Sleeping badly lately and protects her evenings.",
      "Dana is her running partner. Both are quietly worried about Dana's rough month.",
      "Gives great advice but hates being asked for it at parties.",
      "Wants a new running group and friends who are not health workers.",
    ],
    curious: ["boxing", "pottery"],
    shareable: [
      "Runner who loves a morning route.",
      "A great listener, but not a fan of big noisy rooms.",
      "Up for low-key events with good company.",
      "Prefers evenings that wrap up by 10pm.",
    ],
    ties: {
      dana: "Running partner and confidant. Worried about her.",
      maya: "Likes her. Wishes they saw each other more.",
    },
  },

  kai: {
    memory: [
      "Freelance photographer. Takes event gigs but dislikes shooting friends' parties for free.",
      "Climbing partner of Jess and photographs her socials. Wants to turn them into a portfolio series.",
      "Just got a gallery rejection and is bruised about it.",
      "Maya's design friend. Helped with her invite artwork once.",
      "Always carries a camera. People either love that or avoid him.",
      "Wants to shoot a short documentary about boxing.",
    ],
    curious: ["boxing", "documentary"],
    shareable: [
      "Photographer who shoots events and portraits.",
      "Climbs with Jess.",
      "Loves a place with great light.",
      "Happy to take photos of a good night.",
    ],
    ties: {
      jess: "Climbing partner. Always at her events with a camera.",
      maya: "Design friend. Would love to shoot her boxing night.",
      tessa: "Shot her sets once.",
    },
    secrets: ["gallery"],
    neverShare: ["gallery"],
  },

  ruby: {
    memory: [
      "Primary school teacher. Exhausted by Thursdays and full of energy at weekends.",
      "Boxes twice a week at The Ring and has been quietly coaching Maya on form.",
      "Went to culinary school with Marco before switching to teaching. They still review each other's menus.",
      "Her class is putting on a spring show, so she is stretched thin.",
      "Moving flats next month, so her weekends are full of boxes.",
      "Loves matching friends up and keeps mental notes on who would get along.",
    ],
    curious: ["restaurants", "trail running"],
    shareable: [
      "Teacher who boxes twice a week.",
      "Loves introducing friends who would get along.",
      "A weekend person. Thursdays are a write-off.",
      "Always down for food.",
    ],
    ties: {
      maya: "Boxing buddy. Proud of how fast she is improving.",
      marco: "Culinary school friend. Honest critics of each other.",
      sam: "Boxing acquaintance. Thinks he and Maya should patch things up.",
    },
  },
};
