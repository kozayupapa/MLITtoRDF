# MLIT GeoJSON to RDF4J Converter

A TypeScript CLI tool that converts Japanese Ministry of Land, Infrastructure, Transport and Tourism (MLIT) GeoJSON data to GeoSPARQL-compliant RDF triples and loads them into an RDF4J triplestore with advanced disaster response analysis capabilities.

## Features

- **Memory-Efficient Streaming Parser**: Processes massive GeoJSON files without memory overflow by streaming features one-by-one.
- **Multiple Data Type Support**: Population, Land Use, and Flood Hazard GeoJSON with automatic detection.
- **Coordinate Transformation**: Converts coordinates from JGD2011 (EPSG:6668) to WGS84 (EPSG:4326).
- **GeoSPARQL Compliance**: Generates RDF triples following OGC GeoSPARQL specification.
- **Geometry Aggregation**: Aggregates flood hazard zones by risk rank to optimize data size and query performance.
- **Batch Loading**: Optimized bulk loading to RDF4J servers with configurable batch sizes.
- **Disaster Analysis Queries**: Pre-built SPARQL queries for emergency response and satellite imaging prioritization.

## Quick Start

This guide will help you download the necessary data and run your first conversion.

### 1. Data Download

This tool processes geospatial data provided by the Japanese Ministry of Land, Infrastructure, Transport and Tourism (MLIT). You can download sample data from the following official sources:

- **洪水浸水想定区域データ (Flood Hazard Data):** [国土地理院ウェブサイト](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A31a-2024.html)
- **地域メッシュ統計 (Population Mesh Data):** [国土地理院ウェブサイト](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-mesh1000r6.html)

Download the desired GeoJSON files and place them in a local directory, for example, a `data/` folder within this project.

### 2. Installation

```bash
# Clone the repository
git clone <repository-url>
cd MLIDDataRDF

# Install dependencies
yarn install

# Build the project (optional, `yarn dev` uses ts-node)
yarn build
```

### 3. Usage Examples

Here are some common commands for processing different types of data.

**Example 1: Processing Population Data**

This command processes a single population mesh GeoJSON file and loads it into the `test4` repository.

```bash
yarn dev -- --filePaths ./data/your_population_data.geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId test4
```

*Note: Replace `./data/your_population_data.geojson` with the actual path to your file.*

**Example 2: Processing Land Use Data**

This command processes multiple land use GeoJSON files at once and explicitly sets the data type.

```bash
yarn dev -- --filePaths ./data/landuse_file_1.geojson ./data/landuse_file_2.geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId test2 \
            --dataType landuse-geojson
```

**Example 3: Processing Flood Hazard Data with Aggregation**

This command processes flood hazard data, aggregates geometries by risk rank for efficiency, and enables geometry simplification.

```bash
yarn dev -- --filePaths ./data/your_flood_data.geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId test7 \
            --aggregateByRank true \
            --enableSimplification
```

## Command-Line Reference

| Option                      | Description                               | Default                    |
| --------------------------- | ----------------------------------------- | -------------------------- |
| `--filePaths <paths...>`    | Paths to input GeoJSON files (multiple)  | Required                   |
| `--rdf4jEndpoint <url>`     | RDF4J server endpoint URL                 | Required                   |
| `--repositoryId <id>`       | RDF4J repository identifier               | Required                   |
| `--baseUri <uri>`           | Base URI for generated RDF resources      | `http://example.org/mlit/` |
| `--batchSize <size>`        | Number of triples per batch               | `1000`                     |
| `--maxFeatures <num>`       | Maximum features to process               | `unlimited`                |
| `--skipFeatures <num>`      | Number of features to skip                | `0`                        |
| `--logLevel <level>`        | Logging level (debug, info, warn, error)  | `info`                     |
| `--dataType <type>`         | Data type (population-geojson, landuse-geojson, flood-geojson, auto) | `auto`      |
| `--aggregateByRank`         | Aggregate flood hazard zones by rank      | `false`                    |
| `--enableSimplification`    | Enable polygon simplification for display | `false`                    |
| `--testConnection`          | Test RDF4J connection only                | `false`                    |
| `--dryRun`                  | Parse and transform without loading       | `false`                    |

## SPARQL Query Execution

```bash
# Execute pre-built disaster analysis queries
yarn sparql:basic
yarn sparql:window
yarn sparql:enhanced

# Execute a custom query file
yarn sparql -- --file my-query.sparql \
               --endpoint http://localhost:8080/rdf4j-server \
               --repository test \
               --format json
```

## Architecture

### Core Components

- **`main.ts`**: CLI interface and processing orchestration.
- **`data-parser.ts`**: Memory-efficient streaming GeoJSON parser.
- **`geo-transformer.ts`**: Coordinate transformation and RDF triple generation.
- **`rdf-loader.ts`**: Batch loading to RDF4J with error handling.
- **`ontology-config.ts`**: RDF ontology definitions.
- **`sparql-executor.ts`**: SPARQL query executor.

## Development

```bash
# Install dependencies
yarn install

# Run in development mode
yarn dev -- ...

# Execute SPARQL queries
yarn sparql:basic

# Build TypeScript
yarn build

# Run linter
yarn lint

# Run tests
yarn test
```

## Requirements

- Node.js 18+
- TypeScript 5.3+
- An active RDF4J Server (tested with 4.x)

## License

MIT
