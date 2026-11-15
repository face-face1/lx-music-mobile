import state from './state'
import { event } from './event'
import { saveDownloadList } from '@/utils/data'


const handleChange = () => {
  event.download_list_changed()
  saveDownloadList(state.list)
  global.app_event.downloadListUpdate()
}

export const setDownloadList = (list: LX.Download.ListItem[]) => {
  state.list = list
  handleChange()
}

export const addDownloadTasks = (tasks: LX.Download.ListItem[]) => {
  state.list = [...tasks, ...state.list]
  handleChange()
}

export const updateDownloadTask = (id: string, patch: Partial<LX.Download.ListItem>) => {
  const index = state.list.findIndex(task => task.id == id)
  if (index < 0) return
  const list = [...state.list]
  list[index] = { ...list[index], ...patch }
  state.list = list
  handleChange()
}

export const patchDownloadTaskMetadata = (id: string, patch: Partial<LX.Download.ListItem['metadata']>) => {
  const index = state.list.findIndex(task => task.id == id)
  if (index < 0) return
  const list = [...state.list]
  list[index] = { ...list[index], metadata: { ...list[index].metadata, ...patch } }
  state.list = list
  handleChange()
}

export const removeDownloadTasks = (ids: string[]) => {
  const removeIds = new Set(ids)
  state.list = state.list.filter(task => !removeIds.has(task.id))
  handleChange()
}
