/**
 * SVG-иконки исходной системы встраиваются в DOM (а не через <img>), чтобы CSS мог их перекрашивать.
 * Источник разметки — файлы проекта (src/assets), пользовательские данные сюда не попадают.
 */
export function Svg({ src, className = "", title }: { src: string; className?: string; title?: string }) {
  return <span className={`inline-flex items-center justify-center ${className}`} title={title} dangerouslySetInnerHTML={{ __html: src }} />
}
