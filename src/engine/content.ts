import type { Issue, Portfolio } from "./types";

/** The ministries on the table. Prestige drives both price and betrayal cost. */
export const PORTFOLIOS: Portfolio[] = [
  { key: "finance", name: "Finance", prestige: 10, axis: "economy" },
  { key: "defence", name: "Defence", prestige: 10, axis: "security" },
  { key: "interior", name: "Interior", prestige: 9, axis: "society" },
  { key: "foreign", name: "Foreign Affairs", prestige: 8, axis: "security" },
  { key: "justice", name: "Justice", prestige: 8, axis: "society" },
  { key: "education", name: "Education", prestige: 7, axis: "society" },
  { key: "health", name: "Health", prestige: 6, axis: "economy" },
  { key: "housing", name: "Housing", prestige: 6, axis: "economy" },
  { key: "industry", name: "Trade & Industry", prestige: 5, axis: "economy" },
  { key: "transport", name: "Transport", prestige: 5, axis: "economy" },
  { key: "energy", name: "Energy", prestige: 4, axis: "economy" },
  { key: "agriculture", name: "Agriculture", prestige: 4, axis: "economy" },
  { key: "environment", name: "Environment", prestige: 3, axis: "economy" },
  { key: "culture", name: "Culture & Sport", prestige: 3, axis: "society" },
  { key: "regions", name: "Regional Development", prestige: 3, axis: "society" },
  { key: "veterans", name: "Veterans Affairs", prestige: 2, axis: "security" },
];

/** The questions a coalition agreement cannot dodge. */
export const ISSUES: Issue[] = [
  {
    key: "budget",
    name: "The budget",
    axis: "economy",
    options: [
      { label: "expand public spending", position: -8 },
      { label: "hold the line", position: 0 },
      { label: "cut taxes and trim the state", position: 8 },
    ],
  },
  {
    key: "welfare",
    name: "Welfare and pensions",
    axis: "economy",
    options: [
      { label: "raise benefits sharply", position: -8 },
      { label: "index to inflation only", position: -1 },
      { label: "tighten eligibility", position: 7 },
    ],
  },
  {
    key: "courts",
    name: "The judiciary",
    axis: "society",
    options: [
      { label: "entrench judicial review", position: -8 },
      { label: "leave the courts alone", position: 0 },
      { label: "let parliament override the bench", position: 8 },
    ],
  },
  {
    key: "schools",
    name: "Religious schooling",
    axis: "society",
    options: [
      { label: "one secular curriculum for all", position: -8 },
      { label: "keep the current patchwork", position: 0 },
      { label: "fund faith schools in full", position: 8 },
    ],
  },
  {
    key: "immigration",
    name: "Immigration",
    axis: "society",
    options: [
      { label: "open the border and regularise migrants", position: -8 },
      { label: "case by case, no headline change", position: 0 },
      { label: "hard quotas and deportations", position: 8 },
    ],
  },
  {
    key: "borderlands",
    name: "The disputed borderlands",
    axis: "security",
    options: [
      { label: "withdraw and negotiate", position: -8 },
      { label: "freeze the status quo", position: 0 },
      { label: "annex and settle", position: 8 },
    ],
  },
  {
    key: "conscription",
    name: "Universal conscription",
    axis: "security",
    options: [
      { label: "abolish the draft", position: -8 },
      { label: "keep the exemptions", position: -1 },
      { label: "draft everyone, no exemptions", position: 8 },
    ],
  },
];

export const PORTFOLIOS_BY_KEY: Record<string, Portfolio> = Object.fromEntries(
  PORTFOLIOS.map((portfolio) => [portfolio.key, portfolio]),
);

export const ISSUES_BY_KEY: Record<string, Issue> = Object.fromEntries(
  ISSUES.map((issue) => [issue.key, issue]),
);
