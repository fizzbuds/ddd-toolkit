export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const intersection = <T>(a: T[], b: T[]) => a.filter((value) => b.includes(value));

export const difference = <T>(a: T[], b: T[]) => a.filter((value) => !b.includes(value));
