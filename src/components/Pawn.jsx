export default function Pawn({ color, x, y, onClick, active }) {
  const innerBase = 'w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center'

  let innerClass = innerBase
  let innerStyle = {}

  if (color === 'Red') {
    // Red: solid circle
    innerClass += ' rounded-full bg-red-500'
  } else if (color === 'Blue') {
    // Blue: heart inside the outlined container
    innerClass += ' bg-sky-500'
    innerStyle.clipPath =
      'polygon(50% 88%, 24% 66%, 10% 42%, 18% 26%, 32% 22%, 50% 34%, 68% 22%, 82% 26%, 90% 42%, 76% 66%)'
  } else if (color === 'Yellow') {
    // Yellow: star inside the outlined container
    innerClass += ' bg-yellow-400'
    innerStyle.clipPath =
      'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
  } else if (color === 'Green') {
    // Green: pentagon inside the outlined container
    innerClass += ' bg-emerald-500'
    innerStyle.clipPath =
      'polygon(50% 5%, 93% 38%, 76% 90%, 24% 90%, 7% 38%)'
  } else {
    innerClass += ' rounded-full bg-zinc-400'
  }

  return (
    <div
      className={`absolute w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white bg-zinc-900 shadow-md flex items-center justify-center cursor-pointer ${
        active ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''
      }`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'left 320ms ease-out, top 320ms ease-out',
      }}
      onClick={onClick}
    >
      <div className={innerClass} style={innerStyle} />
    </div>
  )
}
