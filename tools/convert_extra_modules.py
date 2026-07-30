#!/usr/bin/env python3
import sqlite3, json, re, os, sys
from pathlib import Path

BOOKS = [
('GEN','Génesis'),('EXO','Éxodo'),('LEV','Levítico'),('NUM','Números'),('DEU','Deuteronomio'),('JOS','Josué'),('JDG','Jueces'),('RUT','Rut'),('1SA','1 Samuel'),('2SA','2 Samuel'),('1KI','1 Reyes'),('2KI','2 Reyes'),('1CH','1 Crónicas'),('2CH','2 Crónicas'),('EZR','Esdras'),('NEH','Nehemías'),('EST','Ester'),('JOB','Job'),('PSA','Salmos'),('PRO','Proverbios'),('ECC','Eclesiastés'),('SNG','Cantares'),('ISA','Isaías'),('JER','Jeremías'),('LAM','Lamentaciones'),('EZK','Ezequiel'),('DAN','Daniel'),('HOS','Oseas'),('JOL','Joel'),('AMO','Amós'),('OBA','Abdías'),('JON','Jonás'),('MIC','Miqueas'),('NAM','Nahúm'),('HAB','Habacuc'),('ZEP','Sofonías'),('HAG','Hageo'),('ZEC','Zacarías'),('MAL','Malaquías'),('MAT','Mateo'),('MRK','Marcos'),('LUK','Lucas'),('JHN','Juan'),('ACT','Hechos'),('ROM','Romanos'),('1CO','1 Corintios'),('2CO','2 Corintios'),('GAL','Gálatas'),('EPH','Efesios'),('PHP','Filipenses'),('COL','Colosenses'),('1TH','1 Tesalonicenses'),('2TH','2 Tesalonicenses'),('1TI','1 Timoteo'),('2TI','2 Timoteo'),('TIT','Tito'),('PHM','Filemón'),('HEB','Hebreos'),('JAS','Santiago'),('1PE','1 Pedro'),('2PE','2 Pedro'),('1JN','1 Juan'),('2JN','2 Juan'),('3JN','3 Juan'),('JUD','Judas'),('REV','Apocalipsis')]
STRONG_RE = re.compile(r'^[GH]\d+[a-z]?$')
MORPH_RE = re.compile(r'^(?:[A-Z][A-Za-z0-9+\-]*(?:-[A-Za-z0-9+\-]+)?|[A-Z]{1,4})$')

def dump(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

def details(con, table):
    row=con.execute(f'SELECT * FROM {table} LIMIT 1').fetchone()
    cols=[r[1] for r in con.execute(f'PRAGMA table_info({table})')]
    return dict(zip(cols,row)) if row else {}

def parse_strong_text(s):
    toks=s.split()
    segs=[]; i=0
    while i<len(toks):
        tok=toks[i]
        if STRONG_RE.match(tok):
            if segs:
                segs[-1]['strong']=tok.upper()
                if i+1<len(toks) and MORPH_RE.match(toks[i+1]) and not STRONG_RE.match(toks[i+1]):
                    segs[-1]['morph']=toks[i+1]; i+=1
            else:
                segs.append({'text':'','strong':tok.upper()})
        else:
            segs.append({'text':tok})
        i+=1
    return segs

def convert_bible(src,outroot):
    con=sqlite3.connect(src); d=details(con,'Details')
    module=outroot/'modules/bibles/rv1960-strong'; books=[]
    rows=con.execute('SELECT Book,Chapter,Verse,Scripture FROM Bible ORDER BY Book,Chapter,Verse')
    grouped={}
    for b,c,v,s in rows:
        grouped.setdefault(b,{}).setdefault(str(c),{})[str(v)]={'text':s,'segments':parse_strong_text(s)}
    for n,(bid,name) in enumerate(BOOKS,1):
        file=f'books/{bid}.json'; books.append({'id':bid,'name':name,'number':n,'file':file})
        dump(module/file,{'schemaVersion':2,'book':bid,'name':name,'chapters':grouped.get(n,{})})
    dump(module/'manifest.json',{'schemaVersion':2,'id':'rv1960-strong','type':'bible','name':'Reina-Valera 1960 con Strong','abbreviation':'RV1960+','language':'es','year':1960,'hasStrongs':True,'sourceFormat':'MySword SQLite','books':books})
    con.close()


def convert_dict(src,outroot):
    con=sqlite3.connect(src); d=details(con,'details')
    module=outroot/'modules/dictionaries/multilexico'; buckets={'G':{},'H':{},'OTHER':{}}
    for word,data in con.execute('SELECT word,data FROM dictionary ORDER BY word'):
        key=word.upper(); prefix=key[0] if key and key[0] in 'GH' else 'OTHER'
        buckets[prefix][key]={'term':key,'html':data}
    for p,entries in buckets.items(): dump(module/f'entries-{p}.json',{'schemaVersion':1,'entries':entries})
    dump(module/'manifest.json',{'schemaVersion':2,'id':'multilexico','type':'dictionary','name':'Multiléxico Strong–Chávez–Tuggy–Vine–Swanson','abbreviation':'Multiléxico','language':'es','strong':True,'sourceFormat':'MySword SQLite','entryFiles':{'G':'entries-G.json','H':'entries-H.json','OTHER':'entries-OTHER.json'}})
    con.close()

def main():
    root=Path(__file__).resolve().parents[1]
    convert_bible('/mnt/data/RV1960+.bbl.mybible',root)
    convert_dict('/mnt/data/Multilexico.dct.mybible',root)
    print('Conversion complete')
if __name__=='__main__': main()
