// Pages for each source the tiles link to (see SourceLink.tsx).

export const SOURCE_PAGES = {
  alcatrazCurrent: 'https://tidesandcurrents.noaa.gov/noaacurrents/predictions?id=SFB1204_18',
  pier41Tide: 'https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=9414305',
  goldenGateStation: 'https://tidesandcurrents.noaa.gov/stationhome.html?id=9414290',
  nwsForecast: 'https://forecast.weather.gov/MapClick.php?lat=37.8077&lon=-122.4224',
  bayModel: 'https://tidesandcurrents.noaa.gov/ofs/sfbofs/sfbofs.html',
  sfbofsCurrents: 'https://tidesandcurrents.noaa.gov/ofs/ofs_mapplots.html?ofsregion=sfb&subdomain=en&model_type=currents_forecast',
}

/**
 * Where the current tiles' numbers come from: NOAA's SFBOFS model around the cove
 * when it covers the selected day, otherwise NOAA's Alcatraz SW prediction.
 */
export type CurrentSource = 'sfbofs' | 'alcatraz'
