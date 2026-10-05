import { Subject } from "../../../generated/prisma/enums";

export const SUBJECT_BANGLA_NAMES: Record<Subject, string> = {
  BENGALI: "বাংলা ভাষা ও সাহিত্য",
  ENGLISH: "ইংরেজি ভাষা ও সাহিত্য",
  BD_INTERNATIONAL_AFFAIRS: "বাংলাদেশ ও আন্তর্জাতিক বিষয়াবলি",
  GEOGRAPHY: "ভূগোল, পরিবেশ ও দুর্যোগ",
  SCIENCE: "সাধারণ বিজ্ঞান",
  IT: "কম্পিউটার ও তথ্যপ্রযুক্তি",
  MATH: "গাণিতিক যুক্তি",
  MENTAL_ABILITY: "মানসিক দক্ষতা",
  ETHICS: "নৈতিকতা, মূল্যবোধ ও সুশাসন",
};

export const MAX_WRONG_ANSWERS_LIMIT = 100;
