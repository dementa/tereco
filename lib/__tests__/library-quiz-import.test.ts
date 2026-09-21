import { describe, expect, it } from "vitest";
import { buildQuizPrompt, parseQuizJson } from "../library-quiz-import";

const good = {
  title: "Photosynthesis",
  questions: [
    { question: "What do plants make?", options: ["Sugar", "Salt", "Steel"], answer: "A", explanation: "They make glucose." },
    { question: "Where?", options: ["Roots", "Leaves"], answer: "b" },
  ],
};

describe("parseQuizJson", () => {
  it("converts answer letters to indexes", () => {
    const r = parseQuizJson(JSON.stringify(good));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.quiz.questions.map((q) => q.correctIndex)).toEqual([0, 1]);
      expect(r.quiz.questions[1].explanation).toBeNull();
    }
  });

  it("accepts a reply wrapped in fences and chatter", () => {
    const r = parseQuizJson("Sure! Here you go:\n```json\n" + JSON.stringify(good) + "\n```\nHope it helps.");
    expect(r.ok).toBe(true);
  });

  it("strips letter prefixes the model added to options", () => {
    const r = parseQuizJson(JSON.stringify({ title: "t", questions: [{ question: "q", options: ["A) One", "B) Two"], answer: "A" }] }));
    expect(r.ok && r.quiz.questions[0].options).toEqual(["One", "Two"]);
  });

  it("names the question with an out-of-range answer", () => {
    const r = parseQuizJson(JSON.stringify({ title: "t", questions: [{ question: "q", options: ["x", "y"], answer: "D" }] }));
    expect(r).toEqual({ ok: false, errors: ['Question 1: the answer "D" is not one of its 2 options.'] });
  });

  it("reports every bad question, not just the first", () => {
    const r = parseQuizJson(JSON.stringify({ title: "t", questions: [{ question: "q", options: ["x"], answer: "A" }, { question: "", options: ["x", "y"], answer: "A" }] }));
    expect(!r.ok && r.errors.length).toBe(2);
  });

  it("rejects duplicate options, non-JSON and empty quizzes", () => {
    expect(parseQuizJson(JSON.stringify({ title: "t", questions: [{ question: "q", options: ["x", "X"], answer: "A" }] })).ok).toBe(false);
    expect(parseQuizJson("not json").ok).toBe(false);
    expect(parseQuizJson(JSON.stringify({ title: "t", questions: [] })).ok).toBe(false);
  });
});

describe("buildQuizPrompt", () => {
  it("fills in the count and clamps it", () => {
    expect(buildQuizPrompt(5)).toContain("exactly 5 multiple-choice");
    expect(buildQuizPrompt(500)).toContain("exactly 30 multiple-choice");
    expect(buildQuizPrompt(5)).not.toContain("{{COUNT}}");
  });
});
