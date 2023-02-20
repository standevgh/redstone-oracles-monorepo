import { AggregatedPriceHandler } from "./AggregatedPriceHandler";
import { PriceDataAfterAggregation } from "../types";
import PricesService from "./../fetchers/PricesService";
import {
  DataPackage,
  DataPoint,
  NumericDataPoint,
  SignedDataPackage,
} from "redstone-protocol";
import { Consola } from "consola";

import { config } from "../config";
import {
  DataPackageBroadcaster,
  HttpBroadcaster,
  StreamrBroadcaster,
} from "../broadcasters";
import { BroadcastPerformer } from "./BroadcastPerformer";
import {validateDataPointsForBigPackage} from "../validators/validate-data-feed-for-big-package";
import {ManifestDataProvider} from "./ManifestDataProvider";
const logger = require("./../utils/logger")("runner") as Consola;

const DEFAULT_HTTP_BROADCASTER_URLS = [
  "https://direct-1.cache-service.redstone.finance",
  "https://direct-2.cache-service.redstone.finance",
  "https://direct-3.cache-service.redstone.finance",
];

export class DataPackageBroadcastPerformer
  extends BroadcastPerformer
  implements AggregatedPriceHandler
{
  private readonly httpBroadcaster: DataPackageBroadcaster;
  private readonly streamrBroadcaster: DataPackageBroadcaster;

  constructor(
    broadcasterURLs: string[] | undefined,
    private readonly ethereumPrivateKey: string,
    private readonly manifestDataProvider: ManifestDataProvider,
  ) {
    super();
    this.httpBroadcaster = new HttpBroadcaster(
      broadcasterURLs ?? DEFAULT_HTTP_BROADCASTER_URLS,
      ethereumPrivateKey
    );

    this.streamrBroadcaster = new StreamrBroadcaster(ethereumPrivateKey);
  }

  async handle(
    aggregatedPrices: PriceDataAfterAggregation[],
    pricesService: PricesService
  ): Promise<void> {
    // Excluding "helpful" prices, which should not be signed
    // "Helpful" prices (e.g. AVAX_SPOT) can be used to calculate TWAP values
    const pricesForSigning =
      pricesService.filterPricesForSigning(aggregatedPrices);

    // Signing
    const signedDataPackages = this.signPrices(
      pricesForSigning,
      pricesForSigning[0].timestamp
    );

    // Broadcasting
    await this.broadcastDataPackages(signedDataPackages);
  }

  private signPrices(
    prices: PriceDataAfterAggregation[],
    timestamp: number
  ): SignedDataPackage[] {
    // Prepare data points
    const dataPoints: DataPoint[] = [];
    for (const price of prices) {
      try {
        const dataPoint = priceToDataPoint(price);
        dataPoints.push(dataPoint);
      } catch (e) {
        logger.error(
          `Failed to convert price object to data point for ${price.symbol} (${price.value})`
        );
      }
    }

    // Prepare signed data packages with single data point
    const signedDataPackages = dataPoints.map((dataPoint) => {
      const dataPackage = new DataPackage([dataPoint], timestamp);
      return dataPackage.sign(this.ethereumPrivateKey);
    });

    // Adding a data package with all data points
    const areEnoughDataPoint = validateDataPointsForBigPackage(
      dataPoints,
      this.manifestDataProvider.allTokenCount
    );
    if (areEnoughDataPoint) {
      const bigDataPackage = new DataPackage(dataPoints, timestamp);
      const signedBigDataPackage = bigDataPackage.sign(this.ethereumPrivateKey);
      signedDataPackages.push(signedBigDataPackage);
    }

    return signedDataPackages;
  }

  private async broadcastDataPackages(signedDataPackages: SignedDataPackage[]) {
    const promises = [];
    promises.push(this.httpBroadcaster.broadcast(signedDataPackages));
    if (config.enableStreamrBroadcasting) {
      promises.push(this.streamrBroadcaster.broadcast(signedDataPackages));
    }

    await this.performBroadcast(promises, "data package");
  }
}

function priceToDataPoint(price: PriceDataAfterAggregation): NumericDataPoint {
  return new NumericDataPoint({
    dataFeedId: price.symbol,
    value: price.value,
  });
}