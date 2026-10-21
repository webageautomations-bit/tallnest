// JINGO — "Which Jingo Candy Are You?" quiz content.
// 7 questions, each option scores 2 candies. No candy appears twice in one question,
// so answers genuinely discriminate. Every candy appears 6-7 times across the set.
// productId maps to src/data/jingo-products.ts; mascotId maps to src/data/jingo-mascots.ts.

export interface QuizOption {
  id: string;
  text: string;
  scores: string[]; // product ids awarded 1 point each
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export interface QuizResult {
  productId: string;  // -> jingo-products.ts
  mascotId: string;   // -> jingo-mascots.ts
  title: string;      // personality archetype
  blurb: string;      // result-screen copy
}

// Questions shown per play — a random QUESTION_COUNT are drawn from
// `questions` in the browser on every load / replay.
export const QUESTION_COUNT = 7;

export const questions: QuizQuestion[] = [
  {
    id: 'q1',
    prompt: "You're put in charge of the music. Everyone's listening.",
    options: [
      { id: 'a', text: "Crowd-pleasers only — everyone's singing by the second song", scores: ['cola-candy', 'tangy-candy'] },
      { id: 'b', text: "Something nobody's heard. They'll thank me later", scores: ['falsa-frenzy', 'imli-blast'] },
      { id: 'c', text: 'I change the song every thirty seconds', scores: ['chulbuli', 'chilli-chaska'] },
      { id: 'd', text: 'I hand it to someone else. Too much pressure', scores: ['frosty', 'kachi-keri'] },
    ],
  },
  {
    id: 'q2',
    prompt: 'A friend dares you to do something slightly stupid in front of everyone.',
    options: [
      { id: 'a', text: 'Already done before they finished the sentence', scores: ['chilli-chaska', 'chulbuli'] },
      { id: 'b', text: 'Negotiate the terms first', scores: ['chatkhari', 'kachi-keri'] },
      { id: 'c', text: "Hard pass — I'll film it though", scores: ['frosty', 'falsa-frenzy'] },
      { id: 'd', text: 'Do it, but funnier than they planned', scores: ['cola-candy', 'tangy-candy'] },
    ],
  },
  {
    id: 'q3',
    prompt: 'Big family shaadi. Where do you actually end up?',
    options: [
      { id: 'a', text: 'Middle of the dance floor', scores: ['cola-candy', 'chulbuli'] },
      { id: 'b', text: 'At the food table, reviewing every dish', scores: ['chatkhari', 'kachi-keri'] },
      { id: 'c', text: 'Outside, away from the noise', scores: ['frosty', 'falsa-frenzy'] },
      { id: 'd', text: 'Quietly watching — remembering everything', scores: ['imli-blast', 'tangy-candy'] },
    ],
  },
  {
    id: 'q4',
    prompt: 'The group chat explodes at 1am. You:',
    options: [
      { id: 'a', text: 'Started it', scores: ['cola-candy', 'chilli-chaska'] },
      { id: 'b', text: 'Read 200 messages, reply with one perfect line', scores: ['kachi-keri', 'imli-blast'] },
      { id: 'c', text: "Muted. Tomorrow's problem", scores: ['frosty', 'falsa-frenzy'] },
      { id: 'd', text: 'Send the meme that derails the whole thing', scores: ['chulbuli', 'chatkhari'] },
    ],
  },
  {
    id: 'q5',
    prompt: 'Someone cuts the line right in front of you. Honestly?',
    options: [
      { id: 'a', text: 'Say something. Immediately', scores: ['chilli-chaska', 'kachi-keri'] },
      { id: 'b', text: "Nothing — but I'm judging them forever", scores: ['imli-blast', 'frosty'] },
      { id: 'c', text: 'A joke, loud enough for them to hear', scores: ['chulbuli', 'chatkhari'] },
      { id: 'd', text: 'Let it go, not worth the energy', scores: ['tangy-candy', 'cola-candy'] },
    ],
  },
  {
    id: 'q6',
    prompt: 'Your ideal weekend:',
    options: [
      { id: 'a', text: 'Out with everyone, plans changing three times', scores: ['cola-candy', 'chulbuli'] },
      { id: 'b', text: 'One friend, long conversation, great food', scores: ['chatkhari', 'tangy-candy'] },
      { id: 'c', text: 'Alone, doing my own strange thing', scores: ['falsa-frenzy', 'imli-blast'] },
      { id: 'd', text: 'Something that gets the heart racing', scores: ['chilli-chaska', 'kachi-keri'] },
    ],
  },
  {
    id: 'q7',
    prompt: 'What do people get wrong about you?',
    options: [
      { id: 'a', text: "They think I'm always cheerful", scores: ['tangy-candy', 'cola-candy'] },
      { id: 'b', text: "They think I'm too much", scores: ['chilli-chaska', 'chatkhari'] },
      { id: 'c', text: "They think I'm cold — I'm just calm", scores: ['frosty', 'imli-blast'] },
      { id: 'd', text: "They think they've got me figured out", scores: ['falsa-frenzy', 'chulbuli'] },
    ],
  },
];

export const results: QuizResult[] = [
  { productId: 'cola-candy', mascotId: 'cola', title: 'The Crowd-Pleaser',
    blurb: "You're the one everybody's glad showed up. High energy, zero pretension, and somehow you make any room better just by being in it. Classic for a reason — you never go out of style." },
  { productId: 'kachi-keri', mascotId: 'raw-mango', title: 'The Sharp One',
    blurb: "Tangy, quick, and not afraid to say the thing everyone's thinking. You keep people honest and make them laugh while you do it. Sweet enough to get away with it." },
  { productId: 'tangy-candy', mascotId: 'orange', title: 'The Sunshine',
    blurb: "Bright, warm, impossible to dislike. You lift the mood without trying, and people feel lighter around you. The easy favourite." },
  { productId: 'chilli-chaska', mascotId: 'chilli', title: 'The Daredevil',
    blurb: "Bold, loud, and allergic to boring. You go first and ask later, and the stories are always worth it. Not everyone can handle you — that's the point." },
  { productId: 'chatkhari', mascotId: 'masala', title: 'The Storyteller',
    blurb: "Layered, chatpata, never one note. You've got the best stories at the table and the timing to land them. Every mehfil needs you." },
  { productId: 'frosty', mascotId: 'mint', title: 'The Cool Head',
    blurb: "Calm when everyone else isn't. You don't rush and you don't rattle, and somehow you're the one people come to when things get hot. Refreshing, literally." },
  { productId: 'chulbuli', mascotId: 'khatti-meethi', title: 'The Trickster',
    blurb: "Sweet one second, cheeky the next. Nobody can predict you and that's exactly how you like it. Half mischief, half charm, fully entertaining." },
  { productId: 'imli-blast', mascotId: 'imli', title: 'The Old Soul',
    blurb: "Intense, deep, and you feel things properly. You don't do fake-sweet — you'd rather be real and a little sour than pleasant and forgettable. People remember you." },
  { productId: 'falsa-frenzy', mascotId: 'falsa', title: 'The Wildcard',
    blurb: "Rare, seasonal, entirely your own thing. You don't follow and you don't explain, and the people who get you really get you. If you landed here, you got the rarest result." },
];

// Scoring: tally points across answers; highest total wins.
// Tie-break 1: whichever tied candy was scored by the user's Q7 answer.
// Tie-break 2 (still tied): rarest wins, in this order.
export const rarityOrder = [
  'falsa-frenzy', 'imli-blast', 'kachi-keri', 'frosty',
  'chatkhari', 'chilli-chaska', 'tangy-candy', 'chulbuli', 'cola-candy',
];
