import { text as readStreamText } from "node:stream/consumers";
import { stdin, stdout } from "node:process";

import { readTextFile } from "../../filesystem/workspace.js";

import type { PlannerAnswer, PlannerInquiry } from "../../domain/index.js";
import type { Terminal } from "../terminal.js";

export function renderPlannerInquiry(planner: string, inquiry: PlannerInquiry, terminal: Terminal): void {
  terminal.info("Planner needs clarification before creating a plan.");
  terminal.info(`Planner: ${planner}`);
  terminal.info(`Summary: ${inquiry.summary}`);
  terminal.info(`Planner project id: ${inquiry.sourceProjectId}`);
  terminal.info("");
  terminal.info("Blocking unknowns:");
  if (inquiry.blockingUnknowns.length === 0) {
    terminal.info("  - none");
  } else {
    for (const blocker of inquiry.blockingUnknowns) {
      terminal.info(`  - ${blocker}`);
    }
  }

  terminal.info("");
  terminal.info("Questions:");
  for (const question of inquiry.questions) {
    terminal.info(`  - [${question.id}] ${question.question}`);
    terminal.info(`    Why: ${question.why}`);
  }
}

export async function collectClarificationAnswers(
  inquiry: PlannerInquiry,
  terminal: Terminal,
): Promise<PlannerAnswer[] | null> {
  const answers: PlannerAnswer[] = [];

  for (const question of inquiry.questions) {
    terminal.info("");
    terminal.info(`[${question.id}] ${question.question}`);
    const answer = (await terminal.prompt("Answer: ")).trim();
    if (answer.length === 0) {
      return null;
    }

    answers.push({
      answer,
      question: question.question,
      questionId: question.id,
    });
  }

  return answers;
}

export function canPromptForClarifications(): boolean {
  return stdin.isTTY === true && stdout.isTTY === true;
}

export async function readPlannerResponse(filePath: string): Promise<string> {
  if (filePath === "-") {
    return (await readStreamText(process.stdin)).trim();
  }

  return readTextFile(filePath);
}

export async function readPlannerAnswers(
  filePath: string,
  inquiry: PlannerInquiry,
): Promise<PlannerAnswer[]> {
  if (filePath === "-") {
    throw new Error('Use a real file path for `--answers-file`; stdin is reserved for prompt input and planner JSON.');
  }

  return parsePlannerAnswers(await readPlannerResponse(filePath), inquiry);
}

export function parsePlannerAnswers(raw: string, inquiry: PlannerInquiry): PlannerAnswer[] {
  let value: unknown;

  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Planner answers file is not valid JSON.");
  }

  if (Array.isArray(value)) {
    return parsePlannerAnswerArray(value, inquiry);
  }

  if (value && typeof value === "object") {
    return parsePlannerAnswerMap(value as Record<string, unknown>, inquiry);
  }

  throw new Error("Planner answers JSON must be an object keyed by question id or an array of answer objects.");
}

function parsePlannerAnswerArray(value: unknown[], inquiry: PlannerInquiry): PlannerAnswer[] {
  const questionsById = new Map(inquiry.questions.map((question) => [question.id, question]));

  return inquiry.questions.map((question) => {
    const entry = value.find((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return false;
      }

      return "questionId" in candidate && candidate.questionId === question.id;
    });

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Planner answer for ${question.id} is missing.`);
    }

    const answerEntry = entry as Record<string, unknown>;
    const answer = typeof answerEntry.answer === "string" ? answerEntry.answer.trim() : "";
    const questionId = typeof answerEntry.questionId === "string" ? answerEntry.questionId.trim() : "";
    if (!questionId || !answer) {
      throw new Error(`Planner answer for ${question.id} is incomplete.`);
    }

    return {
      answer,
      question: questionsById.get(questionId)?.question ?? question.question,
      questionId,
    };
  });
}

function parsePlannerAnswerMap(
  value: Record<string, unknown>,
  inquiry: PlannerInquiry,
): PlannerAnswer[] {
  return inquiry.questions.map((question) => {
    const rawAnswer = value[question.id];
    const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";
    if (!answer) {
      throw new Error(`Planner answer for ${question.id} is missing.`);
    }

    return {
      answer,
      question: question.question,
      questionId: question.id,
    };
  });
}
