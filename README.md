# MLIT GeoJSON to RDF4J Converter

A TypeScript CLI tool that converts Japanese Ministry of Land, Infrastructure, Transport and Tourism (MLIT) GeoJSON data to GeoSPARQL-compliant RDF triples and loads them into an RDF4J triplestore.

## Features

- **Streaming GeoJSON Parser**: Memory-efficient processing of large MLIT GeoJSON files (207MB+)
- **Coordinate Transformation**: Converts coordinates from JGD2011 (EPSG:6668) to WGS84 (EPSG:4326)
- **GeoSPARQL Compliance**: Generates RDF triples following OGC GeoSPARQL specification
- **Population Time Series**: Supports multi-year population projection data (2025-2070)
- **Batch Loading**: Optimized bulk loading to RDF4J servers with configurable batch sizes
- **Flexible Data Types**: Supports GeoJSON FeatureCollections and XML population data
- **Comprehensive Logging**: Winston-based logging with configurable levels

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd MLIDDataRDF

# Install dependencies
yarn install

# Build the project
yarn build
```

## Usage

### Basic Usage

```bash
# Convert GeoJSON to RDF and load into RDF4J
yarn dev -- --filePath /path/to/mesh_data.geojson \
            --rdf4jEndpoint http://localhost:7200 \
            --repositoryId your-repo

# Using built distribution
node dist/main.js --filePath /path/to/data.geojson \
                  --rdf4jEndpoint http://localhost:7200 \
                  --repositoryId your-repo
```

### Command Line Options

| Option                      | Description                               | Default                    |
| --------------------------- | ----------------------------------------- | -------------------------- |
| `--filePath <path>`         | Path to input GeoJSON or XML file         | Required                   |
| `--rdf4jEndpoint <url>`     | RDF4J server endpoint URL                 | Required                   |
| `--repositoryId <id>`       | RDF4J repository identifier               | Required                   |
| `--baseUri <uri>`           | Base URI for generated RDF resources      | `http://example.org/mlit/` |
| `--batchSize <size>`        | Number of triples per batch               | `1000`                     |
| `--maxFeatures <num>`       | Maximum features to process               | `unlimited`                |
| `--skipFeatures <num>`      | Number of features to skip                | `0`                        |
| `--logLevel <level>`        | Logging level (debug, info, warn, error)  | `info`                     |
| `--dataType <type>`         | Data type (geojson, xml-population, auto) | `auto`                     |
| `--testConnection`          | Test RDF4J connection only                | `false`                    |
| `--dryRun`                  | Parse and transform without loading       | `false`                    |
| `--no-population-snapshots` | Exclude population time series data       | Include by default         |

### Examples

```bash
# Process with custom batch size and logging
yarn dev -- --filePath ./data/1km_mesh_2024_17.geojson \
            --rdf4jEndpoint http://localhost:7200 \
            --repositoryId population-mesh \
            --batchSize 500 \
            --logLevel debug

# Dry run to validate data without loading
yarn dev -- --filePath ./data/mesh_data.geojson \
            --rdf4jEndpoint http://localhost:7200 \
            --repositoryId test \
            --dryRun

# Process only first 1000 features
yarn dev -- --filePath ./data/large_mesh.geojson \
            --rdf4jEndpoint http://localhost:7200 \
            --repositoryId test \
            --maxFeatures 1000

# Test connection to RDF4J server
yarn dev -- --rdf4jEndpoint http://localhost:7200 \
            --repositoryId test \
            --testConnection
```

## Data Format Support

### GeoJSON Features

The tool processes GeoJSON FeatureCollection files with the following structure:

```json
{
  "type": "FeatureCollection",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::6668" } },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "MESH_ID": "54362268",
        "SHICODE": "17206",
        "PTN_2020": 25.0842,
        "PTN_2025": 19.6977,
        "PT01_2025": 0.2521,
        // ... additional population data by age group and year
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng, lat], ...]]
      }
    }
  ]
}
```

### Generated RDF Structure

The tool generates GeoSPARQL-compliant RDF with the following patterns:

```turtle
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix mlit: <http://example.org/mlit/ontology#> .

# Mesh feature
mlit:mesh_54362268_2025 a geo:Feature, mlit:Mesh ;
    mlit:meshId "54362268" ;
    mlit:administrativeCode "17206" ;
    geo:hasGeometry mlit:geometry_54362268_2025 ;
    mlit:hasPopulationData mlit:population_54362268_2025 .

# Geometry
mlit:geometry_54362268_2025 a geo:Geometry ;
    geo:wktLiteral "<http://www.opengis.net/def/crs/OGC/1.3/CRS84> POLYGON((...))"^^geo:wktLiteral .

# Population snapshot
mlit:population_54362268_2025 a mlit:PopulationSnapshot ;
    mlit:populationYear 2025 ;
    mlit:ageGroup0_4 0.2521 ;
    mlit:ageGroup5_9 0.0 ;
    # ... additional age group data
```

## Architecture

### Core Components

- **`data-parser.ts`**: Streaming GeoJSON parser using stream-json
- **`geo-transformer.ts`**: Coordinate transformation and RDF triple generation
- **`rdf-loader.ts`**: Batch loading to RDF4J with SPARQL UPDATE
- **`ontology-config.ts`**: RDF ontology definitions and URI generation
- **`main.ts`**: CLI interface and orchestration

### Key Features

- **Memory Efficiency**: Streams large files without loading entire datasets into memory
- **Error Resilience**: Continues processing on individual feature errors
- **Batch Optimization**: Configurable batch sizes for optimal RDF4J performance
- **Coordinate Transformation**: proj4 integration for JGD2011 to WGS84 conversion
- **Comprehensive Logging**: Detailed progress tracking and error reporting

## Development

```bash
# Install dependencies
yarn install

# Run in development mode
yarn dev

# Build TypeScript
yarn build

# Run linter
yarn lint

# Run tests
yarn test

# Clean build artifacts
yarn clean
```

## Requirements

- Node.js 18+
- TypeScript 5.3+
- RDF4J Server (tested with 4.x)

## Dependencies

### Core Dependencies

- `commander`: CLI argument parsing
- `winston`: Logging framework
- `stream-json`: Streaming JSON parser
- `proj4`: Coordinate transformation
- `wellknown`: WKT geometry conversion
- `fetch-sparql-endpoint`: SPARQL endpoint client

### Development Dependencies

- `typescript`: TypeScript compiler
- `ts-node`: TypeScript execution
- `jest`: Testing framework
- `eslint`: Code linting

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with appropriate tests
4. Submit a pull request

## Support

For issues and questions, please open an issue in the repository.
