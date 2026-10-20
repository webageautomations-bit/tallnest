// "Which Jingo Candy Are You?" — client logic. Data arrives as JSON from the
// page (built from jingo-quiz.ts + jingo-products.ts + jingo-mascots.ts).
import { pickResult } from "./quiz-score";
import { setShare } from "./share";

interface Option { id: string; text: string; scores: string[] }
interface Question { id: string; prompt: string; options: Option[] }
interface Img { src: string; w: number; h: number }
interface Result {
  id: string; name: string; flavour: string; price: string;
  color: string; tint: string; textOn: "light" | "dark";
  title: string; blurb: string;
  mascot: { label: string; color: string; img: Img };
  pack: Img;
}
interface QuizData { questions: Question[]; results: Result[]; rarityOrder: string[]; url: string }

const PICK_BEAT = 180; // ms the picked option stays lit before advancing

export function initQuiz(): void {
  const root = document.querySelector<HTMLElement>("[data-quiz]");
  const raw = document.getElementById("quiz-data")?.textContent;
  if (!root || !raw) return;
  const data = JSON.parse(raw) as QuizData;
  const { questions, results, rarityOrder, url } = data;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const screens = {
    intro: $("[data-screen=intro]"),
    question: $("[data-screen=question]"),
    result: $("[data-screen=result]"),
  };
  const count = $("[data-count]");
  const bar = $("[data-bar]");
  const fill = $("[data-bar-fill]");
  const prompt = $("[data-prompt]");
  const list = $("[data-options]");
  const back = $<HTMLButtonElement>("[data-back]");
  const live = $("[data-live]");

  let index = 0;
  let answers: (Option | undefined)[] = [];
  let busy = false;

  // Bring the quiz top into view only when it has scrolled under the header.
  const toTop = () => {
    if (root.getBoundingClientRect().top < 80) {
      root.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }
  };

  const show = (name: keyof typeof screens) => {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  };

  const renderQuestion = () => {
    const q = questions[index];
    count.textContent = `Question ${index + 1} of ${questions.length}`;
    bar.setAttribute("aria-valuenow", String(index + 1));
    fill.style.transform = `scaleX(${(index + 1) / questions.length})`;
    prompt.textContent = q.prompt;
    list.replaceChildren(
      ...q.options.map((o) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "qz-opt";
        btn.dataset.option = o.id;
        btn.setAttribute("aria-pressed", String(answers[index]?.id === o.id));
        const letter = document.createElement("span");
        letter.className = "qz-letter";
        letter.setAttribute("aria-hidden", "true");
        letter.textContent = o.id;
        const text = document.createElement("span");
        text.textContent = o.text;
        btn.append(letter, text);
        li.append(btn);
        return li;
      }),
    );
    back.hidden = index === 0;
    show("question");
    prompt.focus({ preventScroll: true });
    toTop();
  };

  const renderResult = () => {
    const chosen = answers.filter((a): a is Option => !!a);
    const id = pickResult(chosen, rarityOrder);
    const r = results.find((x) => x.id === id) ?? results[0];

    const card = $("[data-result-card]");
    card.style.setProperty("--r-tint", r.tint);
    card.style.setProperty("--r-color", r.color);

    const mascot = $<HTMLImageElement>("[data-r-mascot]");
    mascot.src = r.mascot.img.src;
    mascot.width = r.mascot.img.w;
    mascot.height = r.mascot.img.h;
    mascot.alt = `The Jingo ${r.mascot.label} character`;

    const pack = $<HTMLImageElement>("[data-r-pack]");
    pack.src = r.pack.src;
    pack.width = r.pack.w;
    pack.height = r.pack.h;
    pack.alt = `${r.name} pack`;

    const heading = $("[data-r-heading]");
    heading.textContent = `You're ${r.name} — ${r.title}`;
    $("[data-r-blurb]").textContent = r.blurb;
    $("[data-r-name]").textContent = r.name;
    $("[data-r-flavour]").textContent = r.flavour;
    $("[data-r-price]").textContent = r.price;

    setShare(`I'm ${r.name} — ${r.title}. What's your Jingo flavour?`, url);
    show("result");
    live.textContent = `Result: you're ${r.name}, ${r.title}.`;
    heading.focus({ preventScroll: true });
    toTop();
  };

  const start = () => {
    index = 0;
    answers = [];
    renderQuestion();
  };

  list.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".qz-opt");
    if (!btn || busy) return;
    const opt = questions[index].options.find((o) => o.id === btn.dataset.option);
    if (!opt) return;
    answers[index] = opt;
    answers.length = index + 1; // changing an answer discards later ones
    btn.classList.add("is-picked");
    busy = true;
    window.setTimeout(
      () => {
        busy = false;
        if (index < questions.length - 1) {
          index++;
          renderQuestion();
        } else {
          renderResult();
        }
      },
      reduced ? 0 : PICK_BEAT,
    );
  });

  back.addEventListener("click", () => {
    if (index === 0 || busy) return;
    index--;
    renderQuestion();
  });

  $("[data-start]").addEventListener("click", start);
  $("[data-restart]").addEventListener("click", () => {
    show("intro");
    $<HTMLButtonElement>("[data-start]").focus({ preventScroll: true });
    toTop();
  });
}
