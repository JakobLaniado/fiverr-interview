export async function validateClick(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(Math.random() < 0.5);
    }, 500);
  });
}
