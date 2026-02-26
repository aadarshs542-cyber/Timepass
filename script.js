const objects = [
  { name: "Notebook", traits: ["organized", "thoughtful"], symbol: "turns ideas into clear plans" },
  { name: "Umbrella", traits: ["protective", "prepared"], symbol: "stays calm in emotional rainstorms" },
  { name: "Coffee Mug", traits: ["warm", "comforting"], symbol: "brings energy and reassurance" },
  { name: "Backpack", traits: ["resourceful", "adventurous"], symbol: "is always ready for surprises" },
  { name: "Flashlight", traits: ["optimistic", "guiding"], symbol: "finds direction in the dark" },
  { name: "Clock", traits: ["punctual", "disciplined"], symbol: "values rhythm and timing" },
  { name: "Pillow", traits: ["gentle", "empathetic"], symbol: "offers rest and understanding" },
  { name: "Spoon", traits: ["nurturing", "supportive"], symbol: "makes hard moments easier to swallow" },
  { name: "Mirror", traits: ["self-aware", "honest"], symbol: "reflects truth with kindness" },
  { name: "Key", traits: ["curious", "problem-solving"], symbol: "opens hidden possibilities" },
  { name: "Map", traits: ["strategic", "visionary"], symbol: "sees routes where others see confusion" },
  { name: "Plant Pot", traits: ["patient", "growth-minded"], symbol: "cultivates progress over time" },
  { name: "Bicycle", traits: ["balanced", "determined"], symbol: "moves forward with momentum" },
  { name: "Blanket", traits: ["loyal", "comforting"], symbol: "creates safe emotional spaces" },
  { name: "Doorbell", traits: ["social", "welcoming"], symbol: "invites connection" },
  { name: "Scissors", traits: ["decisive", "precise"], symbol: "cuts through clutter" },
  { name: "Tape", traits: ["reliable", "repair-minded"], symbol: "holds things together" },
  { name: "Compass", traits: ["principled", "steady"], symbol: "follows true north values" },
  { name: "Ladder", traits: ["ambitious", "encouraging"], symbol: "helps everyone level up" },
  { name: "Fan", traits: ["adaptable", "refreshing"], symbol: "keeps energy moving" },
  { name: "Water Bottle", traits: ["consistent", "healthy"], symbol: "stays grounded and replenished" },
  { name: "Camera", traits: ["observant", "creative"], symbol: "captures beauty in small moments" },
  { name: "Calculator", traits: ["logical", "focused"], symbol: "solves chaos one step at a time" },
  { name: "Sneakers", traits: ["active", "resilient"], symbol: "keeps going after setbacks" },
  { name: "Apron", traits: ["helpful", "hands-on"], symbol: "jumps in when needed" },
  { name: "Bookmark", traits: ["attentive", "curious"], symbol: "never loses your place in life" },
  { name: "Charger", traits: ["encouraging", "energizing"], symbol: "recharges people around you" },
  { name: "Magnet", traits: ["charismatic", "inclusive"], symbol: "draws people together" },
  { name: "Gloves", traits: ["careful", "protective"], symbol: "handles delicate situations gently" },
  { name: "Whistle", traits: ["alert", "courageous"], symbol: "speaks up at the right time" },
  { name: "Recipe Card", traits: ["inventive", "practical"], symbol: "mixes creativity with structure" },
  { name: "Soap", traits: ["refreshing", "honest"], symbol: "clears away negativity" },
  { name: "Lantern", traits: ["hopeful", "steady"], symbol: "lights the way in uncertainty" },
  { name: "Headphones", traits: ["reflective", "focused"], symbol: "listens before reacting" },
  { name: "Toothbrush", traits: ["disciplined", "detail-oriented"], symbol: "improves life through small habits" },
  { name: "Frying Pan", traits: ["bold", "transformative"], symbol: "turns raw ideas into great outcomes" },
  { name: "Sticky Notes", traits: ["quick-thinking", "organized"], symbol: "spots important reminders" },
  { name: "Sunglasses", traits: ["cool-headed", "confident"], symbol: "keeps perspective under pressure" },
  { name: "Ruler", traits: ["fair", "accurate"], symbol: "brings balance and standards" },
  { name: "Bucket", traits: ["practical", "dependable"], symbol: "handles whatever spills over" },
  { name: "Vacuum", traits: ["thorough", "efficient"], symbol: "cleans up messes fast" },
  { name: "Doorstop", traits: ["grounded", "supportive"], symbol: "keeps opportunities open" },
  { name: "Alarm Clock", traits: ["driven", "accountable"], symbol: "gets everyone moving" },
  { name: "Picnic Basket", traits: ["joyful", "generous"], symbol: "turns ordinary days into celebrations" }
];

const titleParts = ["Trailblazing", "Cosmic", "Wholesome", "Legendary", "Curious", "Radiant", "Steady", "Inventive"];
const archetypeParts = ["Navigator", "Spark", "Architect", "Sidekick", "Alchemist", "Guardian", "Explorer", "Maestro"];
const weaknessTemplates = [
  "Sometimes you overthink tiny choices, like selecting the perfect spoon for cereal.",
  "You can become so prepared that you pack for a 10-minute walk like it's an expedition.",
  "You occasionally give motivational speeches to inanimate objects before starting tasks.",
  "You are known to make detailed plans for relaxing... and then need a break from the plan.",
  "You sometimes trust your intuition so much that maps feel personally offended."
];
const mottoTemplates = [
  '"Keep it curious, kind, and slightly chaotic."',
  '"If it\'s worth doing, add heart and a backup plan."',
  '"Progress first, perfection later."',
  '"Make it meaningful, then make it fun."',
  '"Stay grounded, sparkle anyway."'
];

const generateBtn = document.getElementById("generateBtn");
const resultSection = document.getElementById("result");
const objectList = document.getElementById("objectList");
const personalityTitle = document.getElementById("personalityTitle");
const description = document.getElementById("description");
const strengthList = document.getElementById("strengthList");
const weakness = document.getElementById("weakness");
const motto = document.getElementById("motto");

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickUniqueObjects(count) {
  const pool = [...objects];
  const selection = [];

  for (let i = 0; i < count; i += 1) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    selection.push(pool.splice(randomIndex, 1)[0]);
  }

  return selection;
}

function buildPersonality(selectedObjects) {
  const [first, second, third] = selectedObjects;
  const allTraits = [...first.traits, ...second.traits, ...third.traits];

  const strengths = [
    `You are ${allTraits[0]} and ${allTraits[1]}, helping people feel supported instantly.`,
    `Like a ${second.name.toLowerCase()}, you stay ${allTraits[2]} when life gets noisy.`,
    `Your ${allTraits[4]} nature means you ${third.symbol}.`
  ];

  return {
    title: `${randomItem(titleParts)} ${randomItem(archetypeParts)}`,
    description: `You blend the spirit of a ${first.name.toLowerCase()}, ${second.name.toLowerCase()}, and ${third.name.toLowerCase()}. You naturally ${first.symbol}, ${second.symbol}, and ${third.symbol}. In short, you are the person who turns everyday moments into clever little adventures.`,
    strengths,
    weakness: randomItem(weaknessTemplates),
    motto: randomItem(mottoTemplates)
  };
}

function renderPersonality() {
  const selectedObjects = pickUniqueObjects(3);
  const personality = buildPersonality(selectedObjects);

  objectList.innerHTML = "";
  selectedObjects.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.name;
    objectList.appendChild(li);
  });

  personalityTitle.textContent = personality.title;
  description.textContent = personality.description;

  strengthList.innerHTML = "";
  personality.strengths.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    strengthList.appendChild(li);
  });

  weakness.textContent = personality.weakness;
  motto.textContent = personality.motto;

  resultSection.classList.remove("hidden");
  resultSection.classList.remove("fade-in");
  void resultSection.offsetWidth;
  resultSection.classList.add("fade-in");
}

generateBtn.addEventListener("click", renderPersonality);
