export const sanitize = (name: string) => {
    return name.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\.$/, '');
};