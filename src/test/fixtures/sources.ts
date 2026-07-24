// Fixed source-record fixtures — real MyVariant.info responses, captured verbatim so tests do not
// drift as the live databases change. Only `synonyms` / `_license` / `_score` were removed (never
// read by this app); every field the routes touch is untouched.
//
//   source:      https://myvariant.info/v1/query?q=clinvar.rsid:<rsid>&fields=<route FIELDS>&size=10
//   retrievedAt: 2026-07-24
//   rs6025  — F5 Leiden. ClinVar Variation 642 (T allele) and 226007 (reference C allele).
//             Classified DIFFERENTLY across conditions (Pathogenic / risk factor / Uncertain /
//             drug response) — the record that makes a single "most severe" verdict indefensible.
//             Two RCVs (RCV001095681, RCV005049305) list MULTIPLE conditions each.
//   rs1000000 — intergenic, no ClinVar record at all (dbSNP-only fallback path).

export const rs6025Clinvar = [
  {
    "_id": "chr1:g.169519049C>C",
    "clinvar": {
      "allele_id": 227743,
      "alt": "C",
      "chrom": "1",
      "cytogenic": "1q24.2",
      "gene": {
        "id": "2153",
        "symbol": "F5"
      },
      "hg19": {
        "end": 169519049,
        "start": 169519049
      },
      "hg38": {
        "end": 169549811,
        "start": 169549811
      },
      "hgvs": {
        "coding": [
          "LRG_553t1:c.1601=",
          "LRG_553t1:c.1601G>G",
          "NM_000130.4:c.1601=",
          "NM_000130.5:c.1601="
        ],
        "genomic": [
          "LRG_553:g.41721=",
          "NC_000001.10:g.169519049T>C",
          "NC_000001.11:g.169549811=",
          "NG_011806.1:g.41721="
        ],
        "protein": [
          "",
          "NP_000121.2:p.Arg534=",
          "NP_000121.2:p.Arg534="
        ]
      },
      "rcv": [
        {
          "accession": "RCV000514863",
          "clinical_significance": "Conflicting interpretations of pathogenicity",
          "conditions": {
            "identifiers": {
              "medgen": "C3661900"
            },
            "name": "not provided"
          },
          "last_evaluated": "2022-02-01",
          "number_submitters": 4,
          "origin": "germline",
          "preferred_name": "NM_000130.5(F5):c.1601= (p.Arg534=)",
          "review_status": "criteria provided, conflicting interpretations"
        },
        {
          "accession": "RCV003761828",
          "clinical_significance": "Benign",
          "conditions": {
            "identifiers": {
              "medgen": "C0015499",
              "mondo": "MONDO:0009210",
              "omim": "227400"
            },
            "name": "Congenital factor V deficiency"
          },
          "last_evaluated": "2025-02-04",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.5(F5):c.1601= (p.Arg534=)",
          "review_status": "criteria provided, single submitter"
        }
      ],
      "ref": "C",
      "rsid": "rs6025",
      "type": "single nucleotide variant",
      "variant_id": 226007
    }
  },
  {
    "_id": "chr1:g.169519049C>T",
    "clinvar": {
      "allele_id": 15681,
      "alt": "T",
      "chrom": "1",
      "cytogenic": "1q24.2",
      "gene": {
        "id": "2153",
        "symbol": "F5"
      },
      "hg19": {
        "end": 169519049,
        "start": 169519049
      },
      "hg38": {
        "end": 169549811,
        "start": 169549811
      },
      "hgvs": {
        "coding": [
          "LRG_553t1:c.1601G>A",
          "NM_000130.5:c.1601G>A",
          "NM_00130.4:c.1601G>A"
        ],
        "genomic": [
          "LRG_553:g.41721G>A",
          "NC_000001.10:g.169519049=",
          "NC_000001.10:g.169519049T=",
          "NC_000001.11:g.169549811C>T",
          "NG_011806.1:g.41721G>A"
        ],
        "protein": [
          "",
          "NP_000121.2:p.Arg534Gln",
          "NP_000121.2:p.Arg534Gln",
          "P12259:p.Arg534Gln",
          "p.Arg506Gln",
          "p.Gln534="
        ]
      },
      "omim": "612309.0001",
      "rcv": [
        {
          "accession": "RCV000000675",
          "clinical_significance": "risk factor",
          "conditions": {
            "identifiers": {
              "human_phenotype_ontology": "HP:0002140",
              "medgen": "C0948008",
              "omim": "601367"
            },
            "name": "Ischemic stroke"
          },
          "last_evaluated": "2006-06-15",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "no assertion criteria provided"
        },
        {
          "accession": "RCV000000676",
          "clinical_significance": "risk factor",
          "conditions": {
            "name": "Budd-Chiari syndrome, susceptibility to"
          },
          "last_evaluated": "2006-06-15",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "no assertion criteria provided"
        },
        {
          "accession": "RCV000023935",
          "clinical_significance": "risk factor",
          "conditions": {
            "identifiers": {
              "medgen": "C3280670",
              "mesh": "D000026",
              "mondo": "MONDO:0013727",
              "omim": "614389"
            },
            "name": "Pregnancy loss, recurrent, susceptibility to, 1 (RPRGL1)"
          },
          "last_evaluated": "2006-06-15",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "no assertion criteria provided"
        },
        {
          "accession": "RCV000205002",
          "clinical_significance": "Pathogenic; risk factor",
          "conditions": {
            "identifiers": {
              "human_phenotype_ontology": "HP:0003225",
              "medgen": "C4317320",
              "mondo": "MONDO:0020586",
              "orphanet": "326"
            },
            "name": "Factor V deficiency"
          },
          "last_evaluated": "2020-03-04",
          "number_submitters": 3,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, multiple submitters, no conflicts"
        },
        {
          "accession": "RCV000454249",
          "clinical_significance": "Pathogenic/Pathogenic, low penetrance",
          "conditions": {
            "identifiers": {
              "medgen": "C1861171",
              "mondo": "MONDO:0008560",
              "omim": "188055"
            },
            "name": "Thrombophilia due to activated protein C resistance (THPH2)"
          },
          "last_evaluated": "2023-07-12",
          "number_submitters": 10,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, multiple submitters, no conflicts"
        },
        {
          "accession": "RCV000616414",
          "clinical_significance": "Pathogenic",
          "conditions": {
            "identifiers": {
              "medgen": "CN169374"
            },
            "name": "not specified"
          },
          "last_evaluated": "2021-02-22",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, single submitter"
        },
        {
          "accession": "RCV001095681",
          "clinical_significance": "Pathogenic",
          "conditions": [
            {
              "identifiers": {
                "human_phenotype_ontology": "HP:0003225",
                "medgen": "C4317320",
                "mondo": "MONDO:0020586",
                "orphanet": "326"
              },
              "name": "Factor V deficiency"
            },
            {
              "identifiers": {
                "medgen": "C1861171",
                "mondo": "MONDO:0008560",
                "omim": "188055"
              },
              "name": "Thrombophilia due to activated protein C resistance (THPH2)"
            }
          ],
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, single submitter"
        },
        {
          "accession": "RCV001806997",
          "clinical_significance": "Uncertain significance",
          "conditions": {
            "name": "Susceptibility to severe coronavirus disease (COVID-19) due to an impaired coagulation process"
          },
          "last_evaluated": "2021-06-29",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "no assertion criteria provided"
        },
        {
          "accession": "RCV002399305",
          "clinical_significance": "Pathogenic",
          "conditions": {
            "identifiers": {
              "medgen": "C0950123",
              "mesh": "D030342"
            },
            "name": "Inborn genetic diseases"
          },
          "last_evaluated": "2018-01-23",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, single submitter"
        },
        {
          "accession": "RCV003227589",
          "clinical_significance": "drug response",
          "conditions": {
            "name": "hormonal contraceptives for systemic use response - Toxicity"
          },
          "last_evaluated": "2021-03-24",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "reviewed by expert panel"
        },
        {
          "accession": "RCV003493407",
          "clinical_significance": "Pathogenic",
          "conditions": {
            "identifiers": {
              "medgen": "C3661900"
            },
            "name": "not provided"
          },
          "last_evaluated": "2025-03-04",
          "number_submitters": 2,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, multiple submitters, no conflicts"
        },
        {
          "accession": "RCV003764502",
          "clinical_significance": "Pathogenic",
          "conditions": {
            "identifiers": {
              "medgen": "C0015499",
              "mondo": "MONDO:0009210",
              "omim": "227400"
            },
            "name": "Congenital factor V deficiency"
          },
          "last_evaluated": "2025-02-03",
          "number_submitters": 2,
          "origin": "unknown",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, multiple submitters, no conflicts"
        },
        {
          "accession": "RCV005049305",
          "clinical_significance": "Pathogenic",
          "conditions": [
            {
              "identifiers": {
                "human_phenotype_ontology": "HP:0002140",
                "medgen": "C0948008",
                "omim": "601367"
              },
              "name": "Ischemic stroke"
            },
            {
              "identifiers": {
                "medgen": "C1861171",
                "mondo": "MONDO:0008560",
                "omim": "188055"
              },
              "name": "Thrombophilia due to activated protein C resistance (THPH2)"
            },
            {
              "identifiers": {
                "human_phenotype_ontology": "HP:0002639",
                "medgen": "C0856761",
                "mondo": "MONDO:0010947",
                "omim": "600880",
                "orphanet": "131"
              },
              "name": "Budd-Chiari syndrome (BDCHS)"
            },
            {
              "identifiers": {
                "medgen": "C3280670",
                "mesh": "D000026",
                "mondo": "MONDO:0013727",
                "omim": "614389"
              },
              "name": "Pregnancy loss, recurrent, susceptibility to, 1 (RPRGL1)"
            },
            {
              "identifiers": {
                "medgen": "C0015499",
                "mondo": "MONDO:0009210",
                "omim": "227400"
              },
              "name": "Congenital factor V deficiency"
            }
          ],
          "last_evaluated": "2024-06-19",
          "number_submitters": 1,
          "origin": "germline",
          "preferred_name": "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
          "review_status": "criteria provided, single submitter"
        }
      ],
      "ref": "C",
      "rsid": "rs6025",
      "type": "single nucleotide variant",
      "variant_id": 642
    },
    "snpeff": {
      "ann": {
        "cdna": {
          "length": "9179",
          "position": "1746"
        },
        "cds": {
          "length": "6675",
          "position": "1601"
        },
        "effect": "synonymous_variant",
        "feature_id": "NM_000130.4",
        "feature_type": "transcript",
        "gene_id": "F5",
        "genename": "F5",
        "hgvs_c": "c.1601G>A",
        "hgvs_p": "p.Gln534Gln",
        "protein": {
          "length": "2224",
          "position": "534"
        },
        "putative_impact": "LOW",
        "rank": "10",
        "total": "25",
        "transcript_biotype": "protein_coding"
      }
    }
  }
] as unknown as Record<string, unknown>[];

export const rs1000000Dbsnp = [
  {
    "_id": "chr12:g.126890980G>C",
    "dbsnp": {
      "chrom": "12",
      "gene": [
        {
          "symbol": "LINC02825"
        },
        {
          "symbol": "LOC124903048"
        }
      ],
      "rsid": "rs1000000",
      "vartype": "snv"
    },
    "snpeff": {
      "ann": {
        "effect": "intergenic_region",
        "feature_id": "LOC101927464-LOC100128554",
        "feature_type": "intergenic_region",
        "gene_id": "LOC101927464-LOC100128554",
        "genename": "LOC101927464-LOC100128554",
        "hgvs_c": "n.126890980G>C",
        "putative_impact": "MODIFIER"
      }
    }
  },
  {
    "_id": "chr12:g.126890980G>A",
    "dbsnp": {
      "chrom": "12",
      "gene": [
        {
          "symbol": "LINC02825"
        },
        {
          "symbol": "LOC124903048"
        }
      ],
      "rsid": "rs1000000",
      "vartype": "snv"
    },
    "gnomad_genome": {
      "af": {
        "af": 0.184249
      }
    },
    "snpeff": {
      "ann": {
        "effect": "intergenic_region",
        "feature_id": "LOC101927464-LOC100128554",
        "feature_type": "intergenic_region",
        "gene_id": "LOC101927464-LOC100128554",
        "genename": "LOC101927464-LOC100128554",
        "hgvs_c": "n.126890980G>A",
        "putative_impact": "MODIFIER"
      }
    }
  }
] as unknown as Record<string, unknown>[];

// MyGene.info record for BRCA1, captured verbatim (minus `_license`/`_score`) on 2026-07-24 from
//   https://mygene.info/v3/query?q=symbol:BRCA1&species=human&fields=<route fields>&size=1

export const brca1MyGene = [
  {
    "MIM": "113705",
    "_id": "672",
    "alias": [
      "BRCAI",
      "BRCC1",
      "BROVCA1",
      "FANCS",
      "IRIS",
      "PNCA4",
      "PPP1R53",
      "PSCP",
      "RNF53"
    ],
    "ensembl": {
      "gene": "ENSG00000012048"
    },
    "entrezgene": "672",
    "genomic_pos": {
      "chr": "17",
      "end": 43170245,
      "ensemblgene": "ENSG00000012048",
      "start": 43044292,
      "strand": -1
    },
    "name": "BRCA1 DNA repair associated",
    "summary": "This gene encodes a 190 kD nuclear phosphoprotein that plays a role in maintaining genomic stability, and it also acts as a tumor suppressor. The BRCA1 gene contains 22 exons spanning about 110 kb of DNA. The encoded protein combines with other tumor suppressors, DNA damage sensors, and signal transducers to form a large multi-subunit protein complex known as the BRCA1-associated genome surveillance complex (BASC). This gene product associates with RNA polymerase II, and through the C-terminal domain, also interacts with histone deacetylase complexes. This protein thus plays a role in transcription, DNA repair of double-stranded breaks, and recombination. Mutations in this gene are responsible for approximately 40% of inherited breast cancers and more than 80% of inherited breast and ovarian cancers. Alternative splicing plays a role in modulating the subcellular localization and physiological function of this gene. Many alternatively spliced transcript variants, some of which are disease-associated mutations, have been described for this gene, but the full-length natures of only some of these variants has been described. A related pseudogene, which is also located on chromosome 17, has been identified. [provided by RefSeq, May 2020].",
    "symbol": "BRCA1",
    "type_of_gene": "protein-coding",
    "uniprot": {
      "Swiss-Prot": "P38398"
    }
  }
] as unknown as Record<string, unknown>[];
