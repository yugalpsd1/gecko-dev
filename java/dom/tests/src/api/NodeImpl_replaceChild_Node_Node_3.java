
/*
 The contents of this file are subject to the Mozilla Public
 License Version 1.1 (the "License"); you may not use this file
 except in compliance with the License. You may obtain a copy of
 the License at http://www.mozilla.org/MPL/

 Software distributed under the License is distributed on an "AS
 IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 implied. See the License for the specific language governing
 rights and limitations under the License.

 The Original Code is mozilla.org code.

 The Initial Developer of the Original Code is Sun Microsystems,
 Inc. Portions created by Sun are
 Copyright (C) 1999 Sun Microsystems, Inc. All
 Rights Reserved.

 Contributor(s):
*/

package org.mozilla.dom.test;

import java.util.*;
import java.io.*;
import org.mozilla.dom.test.*;
import org.mozilla.dom.*;
import org.w3c.dom.*;

public class NodeImpl_replaceChild_Node_Node_3 extends BWBaseTest implements Execution
{

   /**
    *
    ***********************************************************
    *  Constructor
    ***********************************************************
    *
    */
   public NodeImpl_replaceChild_Node_Node_3()
   {
   }


   /**
    *
    ***********************************************************
    *  Starting point of application
    *
    *  @param   args    Array of command line arguments
    *
    ***********************************************************
    */
   public static void main(String[] args)
   {
   }

   /**
    ***********************************************************
    *
    *  Execute Method 
    *
    *  @param   tobj    Object reference (Node/Document/...)
    *  @return          true or false  depending on whether test passed or failed.
    *
    ***********************************************************
    */
   public boolean execute(Object tobj)
   {
      if (tobj == null)  {
           TestLoader.logPrint("Object is NULL...");
           return BWBaseTest.FAILED;
      }

      String os = System.getProperty("OS");
      osRoutine(os);

      Document d = (Document)tobj;
      if (d != null)
      {
       try {
         String elname = "SCRIPT";
         Element e = d.createElement(elname);
         if (e == null)
         {
            TestLoader.logErrPrint("Could not create Element " + elname);
            return BWBaseTest.FAILED;
         }

         String newelname = "BASE";
         Element newChild = d.createElement(elname);
         if (newChild == null)
         {
            TestLoader.logErrPrint("Could not create Element " + newelname);
            return BWBaseTest.FAILED;
         }

         String nodename = "HEAD";
         NodeList nl = d.getElementsByTagName(nodename);
         if (nl != null) 
         {
            int len = nl.getLength();

            Node n = nl.item(0);
	    if (n.getNodeName().compareTo(nodename) == 0)
	    {
                Node oldChild = n.appendChild(e);
                if (oldChild == null)
                {
                   TestLoader.logErrPrint("Could Not appendChild " + elname);
                   return BWBaseTest.FAILED;
                }

                Node rNode = n.replaceChild(newChild, oldChild);
		if (rNode == null)
                {
                   TestLoader.logErrPrint("Could not Replce Node " + elname + "  with node " + newelname);
                   return BWBaseTest.FAILED;
                }
            }
         } else {
            TestLoader.logErrPrint("Could not find Node " + nodename);
            return BWBaseTest.FAILED;
         }
       } catch (DOMException e) {
            TestLoader.logErrPrint("Caught DOMException");
            return BWBaseTest.FAILED;
        } catch (RuntimeException r) {
             String msg = "Caught RuntimeException " + r ; 
             TestLoader.logErrPrint(msg);
             return BWBaseTest.FAILED;
       }
      } else {
             System.out.println("Document is  NULL..");
             return BWBaseTest.FAILED;
      }

      return BWBaseTest.PASSED;
   }

   /**
    *
    ***********************************************************
    *  Routine where OS specific checks are made. 
    *
    *  @param   os      OS Name (SunOS/Linus/MacOS/...)
    ***********************************************************
    *
    */
   private void osRoutine(String os)
   {
     if(os == null) return;

     os = os.trim();
     if(os.compareTo("SunOS") == 0) {}
     else if(os.compareTo("Linux") == 0) {}
     else if(os.compareTo("Windows") == 0) {}
     else if(os.compareTo("MacOS") == 0) {}
     else {}
   }
}
