/** Consume each observed calendar-day change once, even if its refresh fails. */
export function createCampingRollover(initialDate: string) {
  let observedDate = initialDate;
  return (date: string): boolean => {
    if (date === observedDate) return false;
    observedDate = date;
    return true;
  };
}
