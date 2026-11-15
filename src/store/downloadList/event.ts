import Event from '@/event/Event'


class DownloadListEvent extends Event {
  download_list_changed() {
    this.emit('download_list_changed')
  }
}


type EventMethods = Omit<EventType, keyof Event>


declare class EventType extends DownloadListEvent {
  on<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): any
  off<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): any
}

type DownloadListEventTypes = Omit<EventType, keyof Omit<Event, 'on' | 'off'>>


export const event: DownloadListEventTypes = new DownloadListEvent()
