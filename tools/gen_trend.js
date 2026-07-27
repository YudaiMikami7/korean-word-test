/* 今日のトレンド問題の単語を trend-words.js に追記する
 *
 *   node tools/gen_trend.js 2026-07-29 "トピック名" trend.json
 *
 * trend.json は5語ぶんの配列:
 *   [{"ko":"컴백","ja":"カムバック","read":"コムベク","note":"..."} , ... ]
 *
 * 単語はXのK-POPトレンドから毎日拾う想定。既にその日付がある場合は上書きする。 */
const fs=require("fs"),path=require("path");
const [day,topic,src]=process.argv.slice(2);
if(!day||!topic||!src){console.error("usage: node tools/gen_trend.js YYYY-MM-DD <topic> <words.json>");process.exit(1);}
if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){console.error("日付は YYYY-MM-DD で");process.exit(1);}
const words=JSON.parse(fs.readFileSync(src,"utf8").replace(/^﻿/,"")); // WindowsのUTF-8はBOM付きになりがち
if(!Array.isArray(words)||words.length<5){console.error("単語は5語必要です");process.exit(1);}
words.forEach((w,i)=>{if(!w.ko||!w.ja){console.error(`words[${i}] に ko / ja がありません`);process.exit(1);}});

const file=path.join(__dirname,"..","trend-words.js");
let txt=fs.readFileSync(file,"utf8");
const entry='  "'+day+'": {\n'
  +'    topic: '+JSON.stringify(topic)+',\n'
  +'    source: "X / K-POP",\n'
  +'    words: [\n'
  +words.slice(0,5).map(w=>'      { ko: '+JSON.stringify(w.ko)+', ja: '+JSON.stringify(w.ja)
      +', read: '+JSON.stringify(w.read||"")+', note: '+JSON.stringify(w.note||"")+' }').join(",\n")+"\n"
  +"    ]\n  }";

// 同じ日付の既存ブロックは丸ごと差し替え
const re=new RegExp('  "'+day+'": \\{[\\s\\S]*?\\n  \\},?\\n');
if(re.test(txt)){
  txt=txt.replace(re,entry+",\n");
}else{
  const at=txt.lastIndexOf("\n};");
  if(at<0){console.error("trend-words.js の形が想定と違います");process.exit(1);}
  const head=txt.slice(0,at),tail=txt.slice(at);
  txt=head.replace(/,?\s*$/,"")+",\n"+entry+tail;
}
// 末尾のカンマだけ整える
txt=txt.replace(/,(\s*)\n\};/,"$1\n};");
fs.writeFileSync(file,txt);
console.log("wrote "+day+" ("+words.length+" words) -> trend-words.js");
