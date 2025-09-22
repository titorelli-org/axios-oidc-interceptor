export const fixProtocol = (as: any) => {
  return Object.fromEntries(
    Object.entries(as).map(([key, value]) => {
      if (value == null) return [key, value];

      if (
        typeof value === "string" &&
        value.startsWith("http") &&
        as.issuer.startsWith("https")
      ) {
        return [key, value.replace("http://", "https://")];
      }

      if (typeof value === "object") {
        return [key, fixProtocol(value)];
      }

      return [key, value];
    }),
  );
};
