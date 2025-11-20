export default function Pawn({ color, x, y, onClick, active }) {
  const colorClasses = {
    Red: 'bg-red-500 border-red-200',
    Blue: 'bg-sky-500 border-sky-200',
    Yellow: 'bg-yellow-400 border-yellow-100 text-zinc-900',
    Green: 'bg-emerald-500 border-emerald-200',
  }

  return (
    <div
      className={`absolute w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 shadow-md flex items-center justify-center text-[10px] sm:text-xs font-bold cursor-pointer ${
        colorClasses[color] || 'bg-zinc-400 border-zinc-100'
      } ${active ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'left 240ms ease-out, top 240ms ease-out',
      }}
      onClick={onClick}
    />
  )
}
