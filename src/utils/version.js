import { httpGet } from '@/utils/request'
import { downloadFile, stopDownload, temporaryDirectoryPath } from '@/utils/fs'
import { getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'

// 更新渠道指向本 fork 仓库，避免提示更新到原版
const UPDATE_REPO = 'face-face1/lx-music-mobile'
const UPDATE_APP_NAME = 'lx-music-mobile'

const abis = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
]

const address = [
  [`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, 'github'],
  [`https://raw.githubusercontent.com/${UPDATE_REPO}/master/publish/version.json`, 'direct'],
  [`https://cdn.jsdelivr.net/gh/${UPDATE_REPO}@master/publish/version.json`, 'direct'],
]


const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(url, {
      timeout: 10000,
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 3
          ? reject(err || new Error(resp.statusMessage || resp.statusCode))
          : request(url, retryNum).then(resolve).catch(reject)
      } else resolve(body)
    })
  })
}

const getDirectInfo = async(url) => {
  return request(url).then(info => {
    if (info.version == null) throw new Error('failed')
    return info
  })
}

const getNpmPkgInfo = async(url) => {
  return request(url).then(json => {
    if (!json.versionInfo) throw new Error('failed')
    const info = JSON.parse(json.versionInfo)
    if (info.version == null) throw new Error('failed')
    return info
  })
}

const getGithubReleaseInfo = async(url) => {
  return request(url).then(info => {
    if (!info.tag_name) throw new Error('failed')
    return {
      version: String(info.tag_name).replace(/^v/, ''),
      desc: info.body ?? '',
      history: [],
    }
  })
}

export const getVersionInfo = async(index = 0) => {
  const [url, source] = address[index]
  let promise
  switch (source) {
    case 'direct':
      promise = getDirectInfo(url)
      break
    case 'npm':
      promise = getNpmPkgInfo(url)
      break
    case 'github':
      promise = getGithubReleaseInfo(url)
      break
  }

  return promise.catch(async(err) => {
    index++
    if (index >= address.length) throw err
    return getVersionInfo(index)
  })
}

const getTargetAbi = async() => {
  const supportedAbis = await getSupportedAbis()
  for (const abi of abis) {
    if (supportedAbis.includes(abi)) return abi
  }
  return abis[abis.length - 1]
}
let downloadJobId = null
const noop = (total, download) => {}
let apkSavePath

const getReleaseAssetUrl = async(version, abi) => {
  try {
    const info = await request(`https://api.github.com/repos/${UPDATE_REPO}/releases/tags/v${version}`)
    const assets = Array.isArray(info.assets) ? info.assets : []
    const apkAssets = assets.filter(asset => typeof asset?.name == 'string' && asset.name.endsWith('.apk'))
    const asset = apkAssets.find(asset => asset.name.endsWith(`-${abi}.apk`)) ??
      apkAssets.find(asset => asset.name.includes('universal')) ??
      apkAssets[0]
    return asset?.browser_download_url ?? null
  } catch {
    return null
  }
}

export const downloadNewVersion = async(version, onDownload = noop) => {
  const abi = await getTargetAbi()
  // 优先从 release 附件里匹配对应架构的 APK，兼容自定义命名
  const url = await getReleaseAssetUrl(version, abi) ??
    `https://github.com/${UPDATE_REPO}/releases/download/v${version}/${UPDATE_APP_NAME}-v${version}-${abi}.apk`
  let savePath = temporaryDirectoryPath + '/lx-music-mobile.apk'

  if (downloadJobId) stopDownload(downloadJobId)

  const { jobId, promise } = downloadFile(url, savePath, {
    progressInterval: 500,
    connectionTimeout: 20000,
    readTimeout: 30000,
    begin({ statusCode, contentLength }) {
      onDownload(contentLength, 0)
      // switch (statusCode) {
      //   case 200:
      //   case 206:
      //     break
      //   default:
      //     onDownload(null, contentLength, 0)
      //     break
      // }
    },
    progress({ contentLength, bytesWritten }) {
      onDownload(contentLength, bytesWritten)
    },
  })
  downloadJobId = jobId
  return promise.then(() => {
    apkSavePath = savePath
    return updateApp()
  })
}

export const updateApp = async() => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  await installApk(apkSavePath, APP_PROVIDER_NAME)
}
