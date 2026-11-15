import { getMusicUrl as getOnlineMusicUrl } from './online'
import {
  addDownloadTasks,
  patchDownloadTaskMetadata,
  removeDownloadTasks as removeDownloadTasksFromStore,
  updateDownloadTask,
} from '@/store/downloadList/action'
import downloadState from '@/store/downloadList/state'
import settingState from '@/store/setting/state'
import { getPlayQuality, handleGetOnlineLyricInfo } from './utils'
import {
  downloadFile,
  existsFile,
  externalDirectoryPath,
  mkdir,
  stopDownload,
  unlink,
  writeFile,
} from '@/utils/fs'
import { throttle } from '@/utils/common'
import { formatMusicName } from '@/utils/tools'

export const DOWNLOAD_DIR = `${externalDirectoryPath}/Music`

const EXT_FALLBACK: Record<LX.Quality, LX.Download.FileExt> = {
  '128k': 'mp3',
  '192k': 'mp3',
  '320k': 'mp3',
  flac: 'flac',
  flac24bit: 'flac',
  ape: 'ape',
  wav: 'wav',
}

const pendingIds: string[] = []
let isRunning = false
let currentJobId: number | null = null
let currentTaskId: string | null = null

const extFromUrl = (url: string): LX.Download.FileExt | null => {
  const match = /[?/].*?\.(\w{3,5})(?:[?#]|$)/.exec(url) ?? /\.(\w{3,5})(?:[?#]|$)/.exec(url)
  const ext = match?.[1]?.toLowerCase()
  if (ext && (['mp3', 'flac', 'wav', 'ape'] as string[]).includes(ext)) return ext as LX.Download.FileExt
  return null
}

const sanitizeFileName = (name: string) => {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim().replace(/^\.+/, '') || 'untitled'
}

const uniquePath = async(path: string, ext: string) => {
  let filePath = `${path}.${ext}`
  let num = 1
  while (await existsFile(filePath)) {
    filePath = `${path} (${num++}).${ext}`
  }
  return filePath
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '0MB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

// ---------- 歌词（LRC）保存 ----------
const LRC_TIME_TAG_EXP = /^(\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\])/

const timeTagToMs = (tag: string) => {
  const match = /^(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(tag.slice(1, -1))
  if (!match) return null
  const frac = match[3] ? parseInt(match[3]) * Math.pow(10, 3 - match[3].length) : 0
  return parseInt(match[1]) * 60000 + parseInt(match[2]) * 1000 + frac
}

/**
 * 由歌词信息生成标准 LRC 内容
 * 若有翻译歌词则按相同时间戳合成双语行（词典笔、阿尔法蛋等设备可同步显示）
 */
const buildLrcContent = (lyricInfo: LX.Music.LyricInfo): string => {
  const lyric = lyricInfo.lyric ?? ''
  if (!lyric) return ''
  const tlyric = lyricInfo.tlyric ?? ''

  let tMap: Map<number, string> | null = null
  if (tlyric && /\[\d{1,2}:\d{1,2}/.test(tlyric)) {
    tMap = new Map()
    for (const raw of tlyric.split('\n')) {
      const match = LRC_TIME_TAG_EXP.exec(raw)
      if (!match) continue
      const text = raw.slice(match[0].length).trim()
      if (!text) continue
      const ms = timeTagToMs(match[1])
      if (ms != null && !tMap.has(ms)) tMap.set(ms, text)
    }
    if (!tMap.size) tMap = null
  }

  const lines: string[] = []
  for (const raw of lyric.split('\n')) {
    const line = raw.trimEnd()
    lines.push(line)
    if (!tMap) continue
    const match = LRC_TIME_TAG_EXP.exec(line)
    if (!match) continue
    const text = line.slice(match[0].length).trim()
    if (!text) continue
    const ms = timeTagToMs(match[1])
    if (ms == null) continue
    const trans = tMap.get(ms)
    if (trans) lines.push(`${match[1]}${trans}`)
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** 音频文件对应的歌词文件路径（同名 .lrc） */
export const getLyricPath = (filePath: string) => `${filePath.replace(/\.\w{3,5}$/, '')}.lrc`

const saveLyricForTask = async(task: LX.Download.ListItem) => {
  // 未开启「下载歌词」时不保存
  if (!settingState.setting['download.saveLyric']) return
  try {
    const { lyricInfo } = await handleGetOnlineLyricInfo({
      musicInfo: task.metadata.musicInfo,
      onToggleSource: () => {},
      isRefresh: true,
      allowToggleSource: true,
    })
    const lrc = buildLrcContent(lyricInfo as LX.Music.LyricInfo)
    if (!lrc) return
    await writeFile(getLyricPath(task.metadata.filePath), lrc, 'utf8')
  } catch (err) {
    // 歌词获取或写入失败不影响下载结果
    console.log('save lyric failed:', (err as Error)?.message)
  }
}

const createTask = async(musicInfo: LX.Music.MusicInfoOnline): Promise<LX.Download.ListItem | null> => {
  const quality = getPlayQuality(settingState.setting['player.playQuality'], musicInfo)
  const ext = EXT_FALLBACK[quality]
  const baseName = sanitizeFileName(formatMusicName(settingState.setting['download.fileName'], musicInfo.name, musicInfo.singer))
  await mkdir(DOWNLOAD_DIR).catch(() => {})
  // 文件已存在说明之前下载过，直接跳过避免产生重复文件
  if (await existsFile(`${DOWNLOAD_DIR}/${baseName}.${ext}`)) return null
  const filePath = await uniquePath(`${DOWNLOAD_DIR}/${baseName}`, ext)
  return {
    id: `${musicInfo.source}__${musicInfo.id}`,
    isComplate: false,
    status: 'waiting',
    statusText: '',
    downloaded: 0,
    total: 0,
    progress: 0,
    speed: '',
    metadata: {
      musicInfo,
      url: null,
      quality,
      ext,
      fileName: filePath.split('/').at(-1) ?? baseName,
      filePath,
    },
  }
}

// 下载进度节流更新
const progressUpdateThrottle = throttle((id: string, progress: number, speed: string, downloaded: number, total: number) => {
  updateDownloadTask(id, { progress, speed, downloaded, total })
}, 800)
const lastProgressInfo = new Map<string, { bytes: number, time: number }>()

const handleProgress = (id: string, res: { bytesWritten: number, contentLength: number }) => {
  const last = lastProgressInfo.get(id)
  const now = Date.now()
  let speed = ''
  if (last && now > last.time) {
    const bytesPerSec = (res.bytesWritten - last.bytes) / ((now - last.time) / 1000)
    if (bytesPerSec >= 0) speed = `${formatBytes(bytesPerSec)}/s`
  }
  lastProgressInfo.set(id, { bytes: res.bytesWritten, time: now })
  const total = res.contentLength || 0
  const progress = total > 0 ? Math.min(99, Math.round((res.bytesWritten / total) * 100)) : 0
  progressUpdateThrottle(id, progress, speed, res.bytesWritten, total)
}

const runTask = async(taskId: string) => {
  const task = downloadState.list.find(t => t.id == taskId)
  if (!task) return
  currentTaskId = taskId
  updateDownloadTask(taskId, { status: 'run', statusText: global.i18n.t('download_status_get_url'), speed: '' })

  let jobId: number | null = null
  try {
    let url = task.metadata.url
    if (url) {
      try {
        url = await getOnlineMusicUrl({ musicInfo: task.metadata.musicInfo, isRefresh: false })
      } catch {
        url = null
      }
    }
    if (!url) {
      url = await getOnlineMusicUrl({ musicInfo: task.metadata.musicInfo, isRefresh: true })
    }

    const ext = extFromUrl(url) ?? task.metadata.ext
    let filePath = task.metadata.filePath
    if (ext != task.metadata.ext || !filePath.endsWith(`.${ext}`)) {
      await mkdir(DOWNLOAD_DIR).catch(() => {})
      const baseName = filePath.replace(/\.\w{3,5}$/, '')
      filePath = await uniquePath(baseName, ext)
      patchDownloadTaskMetadata(taskId, { url, ext, fileName: filePath.split('/').at(-1) ?? '', filePath })
    } else {
      patchDownloadTaskMetadata(taskId, { url })
    }

    updateDownloadTask(taskId, { statusText: global.i18n.t('download_status_downloading') })
    lastProgressInfo.set(taskId, { bytes: 0, time: Date.now() })
    const job = downloadFile(url, filePath, {
      progressDivider: 1,
      progress: (res: { bytesWritten: number, contentLength: number }) => {
        handleProgress(taskId, res)
      },
    })
    jobId = job.jobId
    currentJobId = jobId
    const res = await job.promise
    updateDownloadTask(taskId, {
      isComplate: true,
      status: 'completed',
      statusText: '',
      progress: 100,
      speed: '',
      downloaded: res.bytesWritten,
      total: res.bytesWritten,
    })
    // 保存同名 .lrc 歌词文件（后台进行，失败不影响下载）
    void saveLyricForTask(task)
    // 下载完成后自动删除下载历史（文件保留在本地，可在「本地」列表中查看）
    removeDownloadTasksFromStore([taskId])
  } catch (err: any) {
    if (jobId != null) {
      try { stopDownload(jobId) } catch {}
    }
    const filePath = downloadState.list.find(t => t.id == taskId)?.metadata.filePath
    if (filePath) void unlink(filePath).catch(() => {})
    const message = (err as Error)?.message || 'download failed'
    updateDownloadTask(taskId, {
      status: 'error',
      statusText: global.i18n.t('download_status_error', { msg: message }),
      speed: '',
    })
  } finally {
    jobId = null
    currentJobId = null
    currentTaskId = null
    lastProgressInfo.delete(taskId)
    void runQueue()
  }
}

const runQueue = async() => {
  if (isRunning) return
  isRunning = true
  try {
    while (pendingIds.length) {
      const taskId = pendingIds.shift()!
      await runTask(taskId)
    }
  } finally {
    isRunning = false
  }
}

/**
 * 添加下载任务
 * @param musicInfos 在线歌曲信息
 * @returns 实际加入队列的数量
 */
export const startDownloads = async(musicInfos: LX.Music.MusicInfoOnline[]) => {
  const newTasks: LX.Download.ListItem[] = []
  const reTryIds: string[] = []
  for (const musicInfo of musicInfos) {
    const existing = downloadState.list.find(task => task.id == `${musicInfo.source}__${musicInfo.id}`)
    if (existing) {
      if (existing.status == 'error') reTryIds.push(existing.id)
      continue
    }
    const task = await createTask(musicInfo)
    if (task) newTasks.push(task)
  }
  if (newTasks.length) {
    addDownloadTasks(newTasks)
    pendingIds.push(...newTasks.map(task => task.id))
  }
  for (const id of reTryIds) {
    const task = downloadState.list.find(t => t.id == id)
    if (!task || task.status != 'error') continue
    updateDownloadTask(id, { status: 'waiting', statusText: '', progress: 0, downloaded: 0, total: 0 })
    pendingIds.push(id)
  }
  void runQueue()
  return newTasks.length + reTryIds.length
}

export const retryDownloadTask = (id: string) => {
  const task = downloadState.list.find(t => t.id == id)
  if (!task || task.status != 'error') return
  updateDownloadTask(id, { status: 'waiting', statusText: '', progress: 0, downloaded: 0, total: 0 })
  pendingIds.push(id)
  void runQueue()
}

/**
 * 移除下载任务
 * @param ids 任务id
 * @param removeFile 是否同时删除已下载的文件
 */
export const removeDownloads = async(ids: string[], removeFile = false) => {
  const targetIds = new Set(ids)
  const files: string[] = []
  for (const task of downloadState.list) {
    if (!targetIds.has(task.id)) continue
    if (removeFile && task.isComplate) {
      files.push(task.metadata.filePath)
      files.push(getLyricPath(task.metadata.filePath))
    }
    if (task.id == currentTaskId) {
      if (currentJobId != null) {
        try { stopDownload(currentJobId) } catch {}
      }
      const index = pendingIds.indexOf(task.id)
      if (index >= 0) pendingIds.splice(index, 1)
    }
  }
  removeDownloadTasksFromStore(ids)
  await Promise.all(files.map(async filePath => unlink(filePath).catch(() => {})))
}

/**
 * 初始化下载管理器：恢复中断的任务
 */
export const initDownloadManager = () => {
  const interruptedIds: string[] = []
  for (const task of downloadState.list) {
    if (task.isComplate || task.status == 'error') continue
    if (task.status == 'run' || task.status == 'waiting') {
      interruptedIds.push(task.id)
      updateDownloadTask(task.id, { status: 'waiting', statusText: '', speed: '' })
    }
  }
  if (interruptedIds.length) {
    pendingIds.push(...interruptedIds)
    void runQueue()
  }
}
