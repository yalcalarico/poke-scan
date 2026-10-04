export function setFolderName(name) {
  return Array.from(name, (character) =>
    character.charCodeAt(0) < 32 ? ' - ' : character,
  )
    .join('')
    .replace(/[/\\:*?"<>|]/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');
}
