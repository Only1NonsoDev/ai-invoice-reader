/** Expense categories (GL accounts) with the account code used in the Xero export. */
export const CATEGORIES = [
  { name: "Office Supplies", code: "429" },
  { name: "Software & Subscriptions", code: "463" },
  { name: "Professional Fees", code: "412" },
  { name: "Equipment & Furniture", code: "710" },
  { name: "Repairs & Maintenance", code: "473" },
  { name: "Facilities & Cleaning", code: "445" },
  { name: "Marketing & Advertising", code: "400" },
  { name: "Travel & Subsistence", code: "493" },
  { name: "Meals & Entertainment", code: "420" },
  { name: "Utilities", code: "460" },
  { name: "Insurance", code: "461" },
] as const;

export const COST_CENTRES = ["Admin", "Operations", "Finance", "Sales", "Marketing", "Engineering", "People", "Facilities"] as const;

export function accountCode(category: string): string {
  return CATEGORIES.find((c) => c.name === category)?.code ?? "";
}

/** Vendors the finance team already knows. Anything else is flagged as new. */
export const DEFAULT_KNOWN_VENDORS = [
  "Brightwell Stationery Supplies Ltd",
  "Northwind Cloud Analytics, Inc.",
  "Maple & Pine Renovations Inc.",
  "Hartley Office Furniture Ltd",
  "Greenfield Facilities Services Ltd",
  "Tessellate Digital Ltd",
  "Redwood Office Supply Co.",
  "Lakeside Catering Co.",
];

const KEYWORDS: [RegExp, string][] = [
  [/software|subscription|licen[sc]e|saas|hosting|cloud|seat|api\b|domain|cdn/i, "Software & Subscriptions"],
  [/paper|toner|ink|stationery|binder|pens?\b|markers?|envelope/i, "Office Supplies"],
  [/chair|desk|monitor|laptop|furniture|equipment/i, "Equipment & Furniture"],
  [/clean|janitor|window|waste|facilit/i, "Facilities & Cleaning"],
  [/repair|plumb|electric|drywall|renovat|maintenance|labou?r/i, "Repairs & Maintenance"],
  [/print|banner|advert|marketing|campaign|sign(age)?\b|design/i, "Marketing & Advertising"],
  [/consult|legal|accountan|audit|advis|professional/i, "Professional Fees"],
  [/flight|hotel|train|taxi|mileage|travel/i, "Travel & Subsistence"],
  [/lunch|catering|coffee|dinner|meal/i, "Meals & Entertainment"],
  [/electricity|gas\b|water\b|broadband|internet|phone/i, "Utilities"],
  [/insurance|premium|cover/i, "Insurance"],
];

/** A cheap keyword guess at the expense category from the line descriptions. The user can always change it. */
export function suggestCategory(descriptions: string[]): string {
  const text = descriptions.join(" ");
  return KEYWORDS.find(([re]) => re.test(text))?.[1] ?? "";
}
