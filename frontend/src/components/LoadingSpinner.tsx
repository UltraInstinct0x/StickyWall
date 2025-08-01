export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-gray-700"></div>
        <div className="absolute top-0 left-0 w-12 h-12 rounded-full border-4 border-transparent border-t-purple-500 animate-spin"></div>
      </div>
    </div>
  )
}