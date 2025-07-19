export interface PopulationMeshData {
  MESH_ID: string;
  SHICODE: string;
  PTN_2020: number;
  PTN_2024: number;
  PT00_2024: number;
  coordinates: number[][];
}

export interface LandUseMeshData {
  L03b_001: string; // メッシュコード
  L03b_002: string; // 土地利用コード
  L03b_003: string; // 土地利用分類名
}

export interface SchoolFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: number[];
  };
  properties: {
    P29_001: string; // 学校コード
    P29_002: string; // 学校名
    P29_003: string; // 学校種別
    P29_004: string; // 設置者
    P29_005: string; // 所在地コード
    P29_006: string; // 所在地
    P29_007: string; // 備考
  };
}

export interface MedicalFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: number[];
  };
  properties: {
    P04_001: string; // 医療機関コード
    P04_002: string; // 医療機関名
    P04_003: string; // 医療機関種別
    P04_004: string; // 診療科目
    P04_007: string; // 救急告示
    P04_008: number; // 病床数
    P04_009: string; // 公的・私的
    P04_010: string; // 備考
  };
}

export const LAND_USE_COLORS: { [key: string]: string } = {
  // 既存の基本分類
  "田": "#90EE90",
  "その他の農用地": "#FFE4B5",
  "森林": "#228B22",
  "荒地": "#D2B48C",
  "建物用地": "#FF6347",
  "道路": "#696969",
  "鉄道": "#2F4F4F",
  "その他の用地": "#DDA0DD",
  "河川地及び湖沼": "#87CEEB",
  "海浜": "#F0E68C",
  "海水域": "#4682B4",
  "ゴルフ場": "#32CD32",
  "解析範囲外": "#FFFFFF",
  
  // 詳細農業用地分類
  "畑": "#98FB98",
  "果樹園": "#ADFF2F",
  "牧草地": "#7CFC00",
  "桑畑": "#9ACD32",
  
  // 詳細森林分類
  "針葉樹林": "#006400",
  "広葉樹林": "#228B22",
  "混交林": "#2E8B57",
  "竹林": "#32CD32",
  
  // 詳細建物用地分類
  "住宅地": "#FFB6C1",
  "商業地": "#FF69B4",
  "工業地": "#CD5C5C",
  "公共施設用地": "#DDA0DD",
  
  // 詳細交通用地分類
  "一般道路": "#708090",
  "高速道路": "#2F4F4F",
  "駐車場": "#A9A9A9",
  
  // 詳細水域分類
  "河川": "#4169E1",
  "湖沼": "#00BFFF",
  "ため池": "#87CEFA",
  "用水路": "#B0E0E6",
  
  // レクリエーション・スポーツ施設
  "公園・緑地": "#7FFF00",
  "運動場": "#98FB98",
  "墓地": "#D3D3D3",
  
  // 特殊用途地
  "工事中地": "#F0E68C",
  "採石場": "#BC8F8F",
  "埋立地": "#DEB887",
  "太陽光発電施設": "#FFD700",
  "風力発電施設": "#E6E6FA",
  
  // 自然環境
  "湿地": "#20B2AA",
  "干潟": "#F5DEB3",
  "砂丘": "#F4A460",
  "岩石地": "#696969",
};