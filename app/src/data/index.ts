import { applyAmounts, type AmountsFile } from "../amounts";
import type { DocCatalogItem, Measure, Question } from "../types";
import amountsData from "./amounts.json";
import catalogData from "./documents.json";
import glossaryData from "./glossary.json";
import measuresData from "./measures.json";
import questionsData from "./questions.json";

export const AMOUNTS = amountsData as unknown as AmountsFile;
export const MEASURES = applyAmounts(measuresData as unknown as Measure[], AMOUNTS);
export const QUESTIONS = applyAmounts(questionsData as unknown as Question[], AMOUNTS);
export const CATALOG = catalogData as unknown as DocCatalogItem[];
export const GLOSSARY = glossaryData as Record<string, string>;
