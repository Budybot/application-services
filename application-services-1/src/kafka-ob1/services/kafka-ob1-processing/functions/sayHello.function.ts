// sayHello.function.ts
export async function sayHello(
  functionInput: any,
  instanceName: string,
  userEmail: string,
) {
  return { message: `Hello, ${userEmail}!`, instanceName };
}
