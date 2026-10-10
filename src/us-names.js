import { nameVariants } from "./names.js";

/** State FIPS code to postal abbreviation and name, for the spellings of a county. */
export const US_STATES = {
  "01": ["AL", "Alabama"],
  "02": ["AK", "Alaska"],
  "04": ["AZ", "Arizona"],
  "05": ["AR", "Arkansas"],
  "06": ["CA", "California"],
  "08": ["CO", "Colorado"],
  "09": ["CT", "Connecticut"],
  10: ["DE", "Delaware"],
  11: ["DC", "District of Columbia"],
  12: ["FL", "Florida"],
  13: ["GA", "Georgia"],
  15: ["HI", "Hawaii"],
  16: ["ID", "Idaho"],
  17: ["IL", "Illinois"],
  18: ["IN", "Indiana"],
  19: ["IA", "Iowa"],
  20: ["KS", "Kansas"],
  21: ["KY", "Kentucky"],
  22: ["LA", "Louisiana"],
  23: ["ME", "Maine"],
  24: ["MD", "Maryland"],
  25: ["MA", "Massachusetts"],
  26: ["MI", "Michigan"],
  27: ["MN", "Minnesota"],
  28: ["MS", "Mississippi"],
  29: ["MO", "Missouri"],
  30: ["MT", "Montana"],
  31: ["NE", "Nebraska"],
  32: ["NV", "Nevada"],
  33: ["NH", "New Hampshire"],
  34: ["NJ", "New Jersey"],
  35: ["NM", "New Mexico"],
  36: ["NY", "New York"],
  37: ["NC", "North Carolina"],
  38: ["ND", "North Dakota"],
  39: ["OH", "Ohio"],
  40: ["OK", "Oklahoma"],
  41: ["OR", "Oregon"],
  42: ["PA", "Pennsylvania"],
  44: ["RI", "Rhode Island"],
  45: ["SC", "South Carolina"],
  46: ["SD", "South Dakota"],
  47: ["TN", "Tennessee"],
  48: ["TX", "Texas"],
  49: ["UT", "Utah"],
  50: ["VT", "Vermont"],
  51: ["VA", "Virginia"],
  53: ["WA", "Washington"],
  54: ["WV", "West Virginia"],
  55: ["WI", "Wisconsin"],
  56: ["WY", "Wyoming"],
  72: ["PR", "Puerto Rico"],
};

/** Maryland, Missouri, Nevada and Virginia have independent cities, whose county codes start at 510. */
const INDEPENDENT_CITIES = new Set(["24", "29", "32", "51"]);

/**
 * The ways a table writes a county: "Mohave County, AZ", "Mohave County, Arizona", "Mohave AZ", with the
 * type of county the state uses (county, parish, borough) or "city" for an independent city. A bare name
 * is not offered, because most county names exist in several states.
 * @param {string} fips five digit county code
 * @param {string} name name without the type, as the boundary file has it
 */
export function countyNames(fips, name) {
  const state = US_STATES[fips.slice(0, 2)];
  if (!state) return [];
  const independent = INDEPENDENT_CITIES.has(fips.slice(0, 2)) && Number(fips.slice(2)) >= 500;
  const types = independent
    ? ["city", ""]
    : fips.startsWith("22")
      ? ["Parish", ""]
      : fips.startsWith("02")
        ? ["Borough", "Census Area", "Municipality", "City and Borough", ""]
        : fips.startsWith("72")
          ? ["Municipio", "Municipality", ""]
          : ["County", ""];
  const spellings = types.flatMap((type) => state.map((place) => [name, type, place].filter(Boolean).join(" ")));
  return [...new Set(spellings.flatMap(nameVariants))];
}
