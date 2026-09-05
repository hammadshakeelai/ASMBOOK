export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.endsWith('.js')) {
      return await nextResolve(specifier.slice(0, -3) + '.ts', context);
    }
    throw err;
  }
}
