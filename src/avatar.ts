function addAvatarToName(name: string, avatarFolderPath: string): string {
    const avatarPath = `${avatarFolderPath}/${name}.png`; // Assuming avatars are named after the person
    return `<img src="${avatarPath}" alt="${name}'s avatar" class="avatar" /> ${name}`;
}

export { addAvatarToName };