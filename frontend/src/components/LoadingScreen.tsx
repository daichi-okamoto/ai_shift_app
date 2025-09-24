const LoadingScreen = ({ message = '読み込み中です…' }: { message?: string }) => (
  <div className="flex min-h-[60vh] items-center justify-center text-slate-300">
    <div className="flex flex-col items-center gap-3 text-sm">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <p>{message}</p>
    </div>
  </div>
)

export default LoadingScreen
