// Studio Pro - Режимы обработки фото
// Каждый режим определяет, как AI должен обработать фотографию

export const StudioMode = {
  AUTO: 'auto',              // Автоматический выбор
  WALL_ONLY: 'wall_only',    // Только стена (без пола)
  UNIT_BALLOON: 'unit_balloon', // Один шар
  HANDHELD_BOUQUET: 'handheld_bouquet', // Букет в руках
  FLOOR: 'floor',            // Напольная композиция
  PHOTOZONE: 'photozone'     // Фотозона
};

export const ModeDescriptions = {
  [StudioMode.AUTO]: 'Автоматический выбор сцены',
  [StudioMode.WALL_ONLY]: 'Только стена (для настенных композиций)',
  [StudioMode.UNIT_BALLOON]: 'Один шар (студийное фото)',
  [StudioMode.HANDHELD_BOUQUET]: 'Букет в руках',
  [StudioMode.FLOOR]: 'Напольная композиция',
  [StudioMode.PHOTOZONE]: 'Фотозона (полная сцена)'
};
