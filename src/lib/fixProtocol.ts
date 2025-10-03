export const fixProtocol = (obj: any) => {
  const text = JSON.stringify(obj);
  const fixed = text.replace(/http:\/\//gi, "https://");

  return JSON.parse(fixed);
};
