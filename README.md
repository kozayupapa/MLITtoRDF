# MLIT GeoJSON to RDF4J Converter

A TypeScript CLI tool that converts Japanese Ministry of Land, Infrastructure, Transport and Tourism (MLIT) GeoJSON data to GeoSPARQL-compliant RDF triples and loads them into an RDF4J triplestore with advanced disaster response analysis capabilities.

## Features

- **Memory-Efficient Sequential Processing**: Processes large files one-by-one to prevent memory overflow
- **Multiple Data Type Support**: Population GeoJSON and Land Use GeoJSON with automatic detection
- **Coordinate Transformation**: Converts coordinates from JGD2011 (EPSG:6668) to WGS84 (EPSG:4326)
- **GeoSPARQL Compliance**: Generates RDF triples following OGC GeoSPARQL specification
- **Population Time Series**: Supports multi-year population projection data (2020-2024)
- **Land Use Classification**: 27 detailed land use categories including disaster-relevant types
- **Batch Loading**: Optimized bulk loading to RDF4J servers with configurable batch sizes
- **Disaster Analysis Queries**: Pre-built SPARQL queries for emergency response and satellite imaging prioritization
- **Sliding Window Analysis**: 10km grid-based disaster area analysis for optimal resource allocation
- **Interactive Query Execution**: Built-in SPARQL query executor with multiple output formats

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

### Basic Data Processing

```bash
# Convert GeoJSON to RDF and load into RDF4J
yarn dev -- --filePaths /path/to/mesh_data.geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId your-repo

# Process multiple files sequentially (memory-efficient)
yarn dev -- --filePaths file1.geojson file2.geojson file3.geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId your-repo

# Using built distribution
node dist/main.js --filePaths /path/to/data.geojson \
                  --rdf4jEndpoint http://localhost:8080/rdf4j-server \
                  --repositoryId your-repo
```

### SPARQL Query Execution

```bash
# Execute disaster analysis queries
yarn sparql:basic       # Basic disaster priority analysis
yarn sparql:window      # Sliding window disaster analysis
yarn sparql:enhanced    # Enhanced multi-factor analysis
yarn sparql:simple      # Simple disaster response query
yarn sparql:disaster    # Complete disaster assessment
yarn sparql:sample      # Population statistics samples

# Custom query execution
yarn sparql -- --file my-query.sparql \
               --endpoint http://localhost:8080/rdf4j-server \
               --repository test \
               --format json
```

### Command Line Options

#### Data Processing Options

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
| `--dataType <type>`         | Data type (population-geojson, landuse-geojson, auto) | `auto`      |
| `--testConnection`          | Test RDF4J connection only                | `false`                    |
| `--dryRun`                  | Parse and transform without loading       | `false`                    |
| `--includePopulationSnapshots` | Include population time series data    | `true`                     |

#### SPARQL Query Options

| Option                      | Description                               | Default                    |
| --------------------------- | ----------------------------------------- | -------------------------- |
| `--file <path>`            | Path to SPARQL query file                 | Required                   |
| `--endpoint <url>`         | RDF4J server endpoint URL                 | Required                   |
| `--repository <id>`        | RDF4J repository identifier               | Required                   |
| `--format <format>`        | Output format (json, xml, csv, tsv, table)| `table`                   |
| `--timeout <ms>`           | Query timeout in milliseconds             | `30000`                    |
| `--logLevel <level>`       | Logging level                             | `info`                     |

### Examples

```bash
# Process land use data with auto-detection
yarn dev -- --filePaths ./data/L03-a-21_5436-jgd2011_GML/L03-a-21_5436.geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId test \
            --batchSize 500

# Process multiple population files sequentially
yarn dev -- --filePaths ./data/pop1.geojson ./data/pop2.geojson \
            --dataType population-geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId population-mesh

# Dry run to validate data without loading
yarn dev -- --filePaths ./data/mesh_data.geojson \
            --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId test \
            --dryRun

# Execute disaster response analysis
yarn sparql:window --format json

# Test connection to RDF4J server
yarn dev -- --rdf4jEndpoint http://localhost:8080/rdf4j-server \
            --repositoryId test \
            --testConnection
```

## Data Format Support

### Population GeoJSON Features

Population-focused GeoJSON with demographic data:

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
        "PTN_2024": 19.6977,
        "PT01_2024": 0.2521,
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

### Land Use GeoJSON Features

Land use classification data:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature", 
      "properties": { 
        "メッシュ": "54360700", 
        "田": 0, 
        "その他の農用地": 0, 
        "森林": 979464, 
        "荒地": 0, 
        "建物用地": 0, 
        "道路": 0, 
        "鉄道": 0, 
        "その他の用地": 62519, 
        "河川地及び湖沼": 0, 
        "海浜": 0, 
        "海水域": 0, 
        "ゴルフ場": 0, 
        "解析範囲外": 0 
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[136.875, 36.0], [136.875, 36.00833333], [136.8875, 36.00833333], [136.8875, 36.0], [136.875, 36.0]]]
      }
    }
  ]
}
```

### Supported Land Use Categories (27 Types)

**Basic Categories:**
- 田 (Rice Fields)
- その他の農用地 (Other Agricultural Land)
- 森林 (Forest)
- 荒地 (Wasteland)
- 建物用地 (Building Land)
- 道路 (Roads)
- 鉄道 (Railways)
- その他の用地 (Other Land)
- 河川地及び湖沼 (Rivers and Lakes)
- 海浜 (Beach)
- 海水域 (Sea Area)
- ゴルフ場 (Golf Course)

**Detailed Categories:**
- 畑, 果樹園, 牧草地 (Fields, Orchards, Grassland)
- 針葉樹林, 広葉樹林, 混交林 (Forest Types)
- 住宅地, 商業地, 工業地 (Residential, Commercial, Industrial)
- 公園・緑地, 運動場, 墓地 (Parks, Sports, Cemetery)
- 太陽光発電施設, 風力発電施設 (Solar, Wind Power)
- 湿地, 干潟, 砂丘 (Wetland, Tidal Flat, Sand Dune)

## Disaster Response Analysis

### Pre-built SPARQL Queries

The tool includes specialized SPARQL queries for disaster response and emergency planning:

#### Basic Disaster Analysis
```bash
yarn sparql:basic
```
- Population density analysis
- Building damage assessment
- Priority scoring algorithm

#### Sliding Window Analysis
```bash
yarn sparql:window
```
- 10km × 10km grid analysis
- Disaster area overlap detection
- Satellite imaging prioritization
- 3×3 window grid (9 areas)

#### Enhanced Multi-Factor Analysis
```bash
yarn sparql:enhanced
```
- Combined population and land use analysis
- Risk-based categorization
- Detailed statistical breakdown

### Disaster Analysis Features

**Priority Calculation Algorithm:**
- Population density (60%): Total + elderly population (2x weight)
- Building density (30%): Damage assessment potential
- Land use factors (10%): Forest (landslide risk), water (flood risk)

**Sliding Window Grid:**
```
W1: 北西エリア  W2: 北中エリア  W3: 北東エリア
W4: 中西エリア  W5: 中央エリア  W6: 中東エリア  
W7: 南西エリア  W8: 南中エリア  W9: 南東エリア
```

**Sample Use Case: 2024 Noto Peninsula Heavy Rain**
- Disaster center: 37.0°N, 136.8°E
- Impact radius: 20km
- Assessment period: September 1-5, 2024
- Severity level: 4 (severe)

## Generated RDF Structure

### Population Data RDF

```turtle
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix mlit: <http://example.org/mlit/ontology#> .

# Mesh feature
mlit:mesh_54362268_2024 a geo:Feature, mlit:Mesh ;
    mlit:meshId "54362268" ;
    mlit:administrativeCode "17206" ;
    geo:hasGeometry mlit:geometry_54362268_2024 ;
    mlit:hasPopulationData mlit:population_54362268_2024 .

# Geometry
mlit:geometry_54362268_2024 a geo:Geometry ;
    geo:wktLiteral "<http://www.opengis.net/def/crs/OGC/1.3/CRS84> POLYGON((...))"^^geo:wktLiteral .

# Population snapshot
mlit:population_54362268_2024 a mlit:PopulationSnapshot ;
    mlit:populationYear 2024 ;
    mlit:totalPopulation 25.0842 ;
    mlit:ageGroup0_4 0.2521 ;
    mlit:ageCategory65Plus 8.5 .
```

### Land Use Data RDF

```turtle
# Land use data
mlit:landuse_54360700_rice_field a mlit:LandUseData ;
    mlit:landUseCategory "田" ;
    mlit:landUseCode "rice_field" ;
    mlit:landUseArea 0 .

mlit:landuse_54360700_forest a mlit:LandUseData ;
    mlit:landUseCategory "森林" ;
    mlit:landUseCode "forest" ;
    mlit:landUseArea 979464 .

# Mesh relationship
mlit:mesh_54360700 mlit:hasLandUseData mlit:landuse_54360700_forest .
```

## Architecture

### Core Components

- **`main.ts`**: CLI interface and sequential processing orchestration
- **`data-parser.ts`**: Memory-efficient GeoJSON parser with validation
- **`geo-transformer.ts`**: Coordinate transformation and RDF triple generation with land use support
- **`rdf-loader.ts`**: Batch loading to RDF4J with error handling
- **`ontology-config.ts`**: RDF ontology definitions including disaster and land use predicates
- **`sparql-executor.ts`**: Interactive SPARQL query execution with multiple output formats

### Memory-Efficient Processing

**Sequential File Processing:**
```
File 1: Parse → Transform → Load → Clear Memory
File 2: Parse → Transform → Load → Clear Memory
File 3: Parse → Transform → Load → Clear Memory
```

**Batch Processing:**
- Maximum batch size: 500 features (memory-limited)
- Immediate upload after each batch
- Explicit memory cleanup
- Garbage collection hints

### Key Features

- **Memory Efficiency**: Sequential file processing prevents memory overflow
- **Auto-Detection**: Automatically identifies population vs land use data
- **Error Resilience**: Continues processing on individual feature errors
- **Batch Optimization**: Configurable batch sizes for optimal RDF4J performance
- **Coordinate Transformation**: proj4 integration for JGD2011 to WGS84 conversion
- **Comprehensive Logging**: Detailed progress tracking with file-level granularity
- **Disaster Analytics**: Specialized queries for emergency response planning

## Development

```bash
# Install dependencies
yarn install

# Run in development mode with file processing
yarn dev

# Execute SPARQL queries
yarn sparql:basic
yarn sparql:window
yarn sparql:enhanced

# Build TypeScript
yarn build

# Run linter
yarn lint

# Run tests
yarn test

# Clean build artifacts
yarn clean
```

## Available NPM Scripts

### Data Processing
- `yarn dev` - Run data processing in development mode
- `yarn build` - Build TypeScript to JavaScript
- `yarn start` - Run built JavaScript application

### SPARQL Query Execution
- `yarn sparql:basic` - Basic disaster priority analysis
- `yarn sparql:window` - Sliding window analysis (3×3 grid)
- `yarn sparql:enhanced` - Enhanced multi-factor analysis
- `yarn sparql:simple` - Simple disaster response query
- `yarn sparql:disaster` - Complete disaster assessment
- `yarn sparql:sample` - Population statistics samples

### Development Tools
- `yarn lint` - Run ESLint code analysis
- `yarn test` - Run Jest test suite
- `yarn clean` - Clean build artifacts

## Requirements

- Node.js 18+
- TypeScript 5.3+
- RDF4J Server (tested with 4.x)
- Available memory: Scales with largest individual file size

## Dependencies

### Core Dependencies

- `commander`: CLI argument parsing
- `winston`: Logging framework
- `proj4`: Coordinate transformation
- `wellknown`: WKT geometry conversion
- `node-fetch`: HTTP client for RDF4J communication

### Development Dependencies

- `typescript`: TypeScript compiler
- `ts-node`: TypeScript execution
- `jest`: Testing framework
- `eslint`: Code linting

## Sample Data

The repository includes sample data and queries for:
- **Population Analysis**: 1km mesh population data
- **Land Use Analysis**: 500m mesh land use classification
- **Disaster Response**: Noto Peninsula 2024 heavy rain case study
- **SPARQL Queries**: Pre-built disaster analysis queries

## Performance

### Memory Usage
- **Sequential Processing**: Scales with largest single file, not total data size
- **Batch Size**: Configurable (recommended: 500-1000 features)
- **Memory Cleanup**: Automatic garbage collection between files

### Processing Speed
- **Large Files**: 207MB+ GeoJSON files processed efficiently
- **Multiple Files**: No memory accumulation across files
- **RDF4J Upload**: Optimized batch sizes for network efficiency

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with appropriate tests
4. Add SPARQL queries for new analysis types
5. Update README with new features
6. Submit a pull request

## Support

For issues and questions, please open an issue in the repository.

## Disaster Response Use Cases

This tool is particularly useful for:
- **Emergency Response Planning**: Prioritize rescue operations based on population density
- **Satellite Imaging Coordination**: Identify optimal 10km imaging areas
- **Risk Assessment**: Combine population, land use, and disaster impact data
- **Resource Allocation**: Data-driven decisions for emergency services
- **Multi-Hazard Analysis**: Earthquake, flood, landslide risk evaluation
- **Evacuation Planning**: Identify high-priority evacuation areas