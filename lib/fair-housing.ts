/**
 * lib/fair-housing.ts — words that describe who a home or loan is for
 * rather than the home or the loan (Fair Housing Act). Templates (D38) and
 * email signatures (D49) refuse them.
 */
export const FAIR_HOUSING = /\b(famil(y|ies)|family[- ]friendly|kids?|children|young (couples?|professionals?|people)|singles|bachelors?|mature|seniors?|retirees?|adults? only|empty[- ]nesters?|newlyweds?|christian|jewish|muslim|catholic|church(es)?|synagogues?|mosques?|temples?|ethnic|integrated|exclusive (area|neighborhood|community)|handicapped|able[- ]bodied|english[- ]speaking)\b/i;
